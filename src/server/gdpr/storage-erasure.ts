import { getAuth } from "@/lib/auth";
import { getAuditScratchpad } from "@/server/features/audit/AuditScratchpad";
import type { OnboardingChatAgent } from "@/server/features/onboarding/OnboardingChatAgent";
import type { SamChatAgent } from "@/server/features/sam/SamChatAgent";
import { captureServerError } from "@/server/lib/posthog";
import {
  AI_SEARCH_PROMPT_CACHE_NAMESPACE,
  cacheObjectPrefix,
} from "@/server/lib/r2-cache";
import {
  gdprStorageErasurePayloadSchema,
  signGdprErasureRequest,
  type GdprStorageErasurePayload,
} from "@/shared/gdpr-erasure";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const PROMPT_CACHE_PREFIX = cacheObjectPrefix(AI_SEARCH_PROMPT_CACHE_NAMESPACE);

type GoogleRevocationResult = {
  providerId: string;
  accountId: string;
  status: "revoked" | "token_unavailable";
};

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function authenticateRequest(
  request: Request,
  body: string,
  secret: string,
): Promise<boolean> {
  const timestamp = request.headers.get("x-gdpr-timestamp") ?? "";
  const signature = request.headers.get("x-gdpr-signature") ?? "";
  const timestampMs = Number(timestamp);
  if (
    !timestamp ||
    !signature ||
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS
  ) {
    return false;
  }
  const expected = await signGdprErasureRequest(secret, timestamp, body);
  return timingSafeEqual(signature, expected);
}

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

async function deleteOauthGrants(namespace: KVNamespace, userId: string) {
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

async function deleteOrganizationPromptCaches(
  bucket: R2Bucket,
  organizationIds: string[],
) {
  const targets = new Set(organizationIds);
  let cursor: string | undefined;
  const keys: string[] = [];
  do {
    const page = await bucket.list({
      prefix: PROMPT_CACHE_PREFIX,
      cursor,
      include: ["customMetadata"],
    });
    for (const object of page.objects) {
      if (targets.has(object.customMetadata?.organizationId ?? "")) {
        keys.push(object.key);
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (let index = 0; index < keys.length; index += 1_000) {
    await bucket.delete(keys.slice(index, index + 1_000));
  }
  return keys.length;
}

async function revokeGoogleAccount(
  userId: string,
  account: GdprStorageErasurePayload["googleAccounts"][number],
): Promise<GoogleRevocationResult> {
  let accessToken: string | undefined;
  try {
    const result = await getAuth().api.getAccessToken({
      body: {
        userId,
        providerId: account.providerId,
        accountId: account.accountId,
      },
    });
    accessToken = result?.accessToken;
  } catch {
    // If Better Auth cannot mint a token, the locally stored grant is no longer
    // usable. The Postgres transaction still removes its encrypted token row.
    return { ...account, status: "token_unavailable" };
  }
  if (!accessToken) return { ...account, status: "token_unavailable" };

  const response = await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: accessToken }),
  });
  // Google uses invalid_token for an already-revoked token. Either response
  // leaves OpenSEO without a live upstream grant once the local row is erased.
  if (!response.ok && response.status !== 400) {
    throw new Error(
      `Google token revocation failed for ${account.providerId}/${account.accountId}: ${response.status}`,
    );
  }
  return { ...account, status: "revoked" };
}

async function eraseStorage(env: Env, payload: GdprStorageErasurePayload) {
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
  const onboardingChat =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the binding is declared as this class in wrangler.jsonc
    env.ONBOARDING_CHAT as unknown as DurableObjectNamespace<OnboardingChatAgent>;
  for (const projectId of payload.projectIds) {
    await onboardingChat
      .get(onboardingChat.idFromName(projectId))
      .destroyForErasure();
  }
  for (const auditId of payload.auditIds) {
    await getAuditScratchpad(auditId).destroyForErasure();
    await env.KV.delete(`audit-progress:${auditId}`);
  }
  // The autumn:customer-ensured KV markers are deliberately left alone: they
  // hold no personal data (org id key, "1" value), expire on their own 24h
  // TTL, and clearing them would let an in-flight authenticated request
  // re-create the Autumn customer before the Postgres delete lands.

  for (let index = 0; index < payload.r2Keys.length; index += 1_000) {
    await env.R2.delete(payload.r2Keys.slice(index, index + 1_000));
  }
  const promptCacheObjects = await deleteOrganizationPromptCaches(
    env.R2,
    payload.organizationIds,
  );

  const oauth = await deleteOauthGrants(env.OAUTH_KV, payload.userId);
  return {
    workflows: {
      auditTerminated: auditWorkflowsTerminated,
      rankTerminated: rankWorkflowsTerminated,
    },
    durableObjects: {
      sam: payload.samSessionIds.length,
      onboarding: payload.projectIds.length,
      auditScratchpads: payload.auditIds.length,
    },
    kv: {
      auditProgress: payload.auditIds.length,
      oauthGrants: oauth.deletedGrants,
      oauthTokens: oauth.deletedTokens,
    },
    r2Objects: payload.r2Keys.length,
    promptCacheObjects,
    googleRevocations,
  };
}

export async function handleGdprStorageErasure(
  request: Request,
  env: Env,
): Promise<Response> {
  const secret = env.GDPR_ERASURE_SECRET?.trim();
  if (!secret) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // The body is buffered before authentication, so bound it first. workerd
  // hands the handler at most content-length bytes (the connection is killed
  // at the declared length), while a body with no content-length streams
  // unbounded — so the header is required, not advisory.
  if (!request.headers.has("content-length")) {
    return new Response("Content-Length required", { status: 411 });
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    !Number.isInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_BODY_BYTES
  ) {
    return new Response("Payload too large", { status: 413 });
  }

  const rawBody = await request.text();
  if (!(await authenticateRequest(request, rawBody, secret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody || "null") as unknown;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = gdprStorageErasurePayloadSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid erasure payload" }, { status: 400 });
  }

  try {
    const result = await eraseStorage(env, parsed.data);
    return Response.json({ ok: true, result });
  } catch (error) {
    // Raw fetch handlers run outside the server-function middleware, so
    // nothing else reports failures here.
    console.error("gdpr.storage-erasure failed:", error);
    await captureServerError(error, { source: "gdpr_storage_erasure" });
    return Response.json({ error: "Erasure failed" }, { status: 500 });
  }
}
