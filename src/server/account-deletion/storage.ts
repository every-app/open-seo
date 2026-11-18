import {
  getGoogleAccessToken,
  revokeGoogleToken,
} from "@/server/features/google/googleOAuth";
import type { SamChatAgent } from "@/server/features/sam/SamChatAgent";
import { deleteR2Prefix } from "@/server/lib/r2";
import { DashboardCacheService } from "@/server/features/dashboard/services/DashboardCacheService";
import { deleteProjectAiObjects } from "@/server/features/ai-visibility/services/aiVisibilityStorage";
import {
  DUB_REFERRED_ORG_KV_PREFIX,
  DUB_REFERRED_USER_KV_PREFIX,
} from "@/server/referrals/dub";
import type { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import type { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";

/** What an account erasure removes outside the database. */
type StorageErasureInput = {
  userId: string;
  organizationIds: string[];
  /** Every project of the erased organizations. */
  projectIds: string[];
  samSessionIds: string[];
  auditIds: string[];
  activeAuditWorkflowIds: string[];
  activeRankWorkflowIds: string[];
  activeAiVisibilityWorkflowIds: string[];
  activeLocalRankWorkflowIds: string[];
  r2Keys: string[];
  googleAccounts: {
    providerId: typeof GSC_OAUTH_PROVIDER_ID | typeof GA4_OAUTH_PROVIDER_ID;
    accountId: string;
  }[];
};

type GoogleRevocationResult = {
  providerId: string;
  accountId: string;
  status: "revoked" | "token_unavailable";
};

async function terminateWorkflows(workflow: Workflow, ids: string[]) {
  let terminated = 0;
  for (const id of ids) {
    // get() throws for an unknown id; terminate() throws once the instance
    // reached a terminal state. Both mean there is nothing left to stop.
    const instance = await workflow.get(id).catch(() => null);
    if (!instance) continue;
    try {
      await instance.terminate();
      terminated += 1;
    } catch {
      // Already complete, errored, or terminated.
    }
  }
  return terminated;
}

async function deleteKvPrefix(namespace: KVNamespace, prefix: string) {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await namespace.list({ prefix, cursor });
    for (const key of page.keys) {
      await namespace.delete(key.name);
      deleted += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return deleted;
}

export async function deleteOauthGrants(
  namespace: KVNamespace,
  userId: string,
) {
  const grantPrefix = `grant:${userId}:`;
  let cursor: string | undefined;
  let deletedGrants = 0;
  let deletedTokens = 0;
  do {
    const page = await namespace.list({ prefix: grantPrefix, cursor });
    for (const key of page.keys) {
      const grantId = key.name.slice(grantPrefix.length);
      deletedTokens += await deleteKvPrefix(
        namespace,
        `token:${userId}:${grantId}:`,
      );
      await namespace.delete(key.name);
      deletedGrants += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { deletedGrants, deletedTokens };
}

async function revokeGoogleAccount(
  userId: string,
  account: StorageErasureInput["googleAccounts"][number],
): Promise<GoogleRevocationResult> {
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken({
      userId,
      providerId: account.providerId,
      accountId: account.accountId,
    });
  } catch {
    // If no token can be minted, the locally stored grant is no longer usable.
    // The Postgres transaction still removes its encrypted token row.
    return { ...account, status: "token_unavailable" };
  }

  try {
    await revokeGoogleToken(accessToken);
  } catch (error) {
    throw new Error(
      `Google token revocation failed for ${account.providerId}/${account.accountId}`,
      { cause: error },
    );
  }
  return { ...account, status: "revoked" };
}

export async function eraseAccountStorage(
  env: Env,
  payload: StorageErasureInput,
) {
  // Stop live workflows first so a running crawl can't rewrite a scratchpad
  // after it is wiped.
  const auditWorkflowsTerminated = await terminateWorkflows(
    env.SITE_AUDIT_WORKFLOW,
    payload.activeAuditWorkflowIds,
  );
  const rankWorkflowsTerminated = await terminateWorkflows(
    env.RANK_CHECK_WORKFLOW,
    payload.activeRankWorkflowIds,
  );
  const aiWorkflowsTerminated = await terminateWorkflows(
    env.AI_VISIBILITY_WORKFLOW,
    [
      ...payload.activeAiVisibilityWorkflowIds,
      ...payload.projectIds.map(
        (projectId) => `ai-research-setup-${projectId}`,
      ),
    ],
  );
  const localRankWorkflowsTerminated = await terminateWorkflows(
    env.LOCAL_RANK_WORKFLOW,
    payload.activeLocalRankWorkflowIds,
  );

  const googleRevocations: GoogleRevocationResult[] = [];
  for (const account of payload.googleAccounts) {
    googleRevocations.push(await revokeGoogleAccount(payload.userId, account));
  }

  // env.d.ts declares the DO bindings untyped (ambient contexts can't import
  // the classes); narrow here so the erasure RPCs are typed.
  const samChat =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the binding is declared as this class in wrangler.jsonc
    env.SAM_CHAT as unknown as DurableObjectNamespace<SamChatAgent>;
  for (const sessionId of payload.samSessionIds) {
    await samChat.get(samChat.idFromName(sessionId)).destroyForErasure();
  }
  for (const auditId of payload.auditIds) {
    // The scratchpad DO lives in the open-seo-audit worker; destroy is the
    // same full wipe destroyForErasure performs.
    await env.AUDIT_ENGINE.destroyScratchpad(auditId);
    await env.KV.delete(`audit-progress:${auditId}`);
  }
  // The autumn:customer-ensured KV markers are deliberately left alone: they
  // hold no personal data (org id key, "1" value), expire on their own 24h
  // TTL, and clearing them would let an in-flight authenticated request
  // re-create the Autumn customer before the Postgres delete lands.

  // Dub referral pins key on user/org ids and store a referral click
  // identifier. The Dub-side customer record (pseudonymous external id) is
  // not removed here; see docs/maintainers/account-deletion.md.
  await env.KV.delete(`${DUB_REFERRED_USER_KV_PREFIX}${payload.userId}`);
  for (const organizationId of payload.organizationIds) {
    await env.KV.delete(`${DUB_REFERRED_ORG_KV_PREFIX}${organizationId}`);
  }

  for (let index = 0; index < payload.r2Keys.length; index += 1_000) {
    await env.R2.delete(payload.r2Keys.slice(index, index + 1_000));
  }
  // Prompt Explorer's cached answers (dataforseo-cache/ai-search:...) are
  // not listed here: the bucket's lifecycle rule expires them before the
  // waiting period ends, and no new ones can be written once sign-in is
  // blocked.
  let aiVisibilityObjects = 0;
  let searchConsoleCacheObjects = 0;
  let siteAuditObjects = 0;
  for (const projectId of payload.projectIds) {
    aiVisibilityObjects += await deleteProjectAiObjects(env.R2, projectId);
    searchConsoleCacheObjects +=
      await DashboardCacheService.deleteGscCache(projectId);
    // Lighthouse files a best-effort audit deletion missed: their database
    // rows, and so their keys in r2Keys, are already gone.
    siteAuditObjects += await deleteR2Prefix(
      env.R2,
      `site-audit/${projectId}/`,
    );
  }

  const oauth = await deleteOauthGrants(env.OAUTH_KV, payload.userId);
  return {
    workflows: {
      auditTerminated: auditWorkflowsTerminated,
      rankTerminated: rankWorkflowsTerminated,
      aiVisibilityTerminated: aiWorkflowsTerminated,
      localRankTerminated: localRankWorkflowsTerminated,
    },
    durableObjects: {
      sam: payload.samSessionIds.length,
      auditScratchpads: payload.auditIds.length,
    },
    kv: {
      auditProgress: payload.auditIds.length,
      oauthGrants: oauth.deletedGrants,
      oauthTokens: oauth.deletedTokens,
    },
    r2Objects: payload.r2Keys.length,
    aiVisibilityObjects,
    searchConsoleCacheObjects,
    siteAuditObjects,
    googleRevocations,
  };
}
