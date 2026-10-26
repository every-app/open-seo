import { DashboardCacheService } from "@/server/features/dashboard/services/DashboardCacheService";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";
import { GoogleAccountRepository } from "./GoogleAccountRepository";
import { getGoogleAccessToken, revokeGoogleToken } from "./googleOAuth";

type AccountInput = {
  userId: string;
  provider: "gsc" | "ga4";
  accountId: string;
};

async function getRemovalImpact(input: AccountInput) {
  return GoogleAccountRepository.getRemovalImpact(input);
}

// A token minted before the grant row is deleted, so it can be revoked after.
async function tokenForRevocation(grant: {
  userId: string;
  providerId: string;
  accountId: string;
}) {
  return getGoogleAccessToken(grant).catch(() => null);
}

// Google revokes every scope our OAuth client holds for a Google account, so
// revoking while another OpenSEO user (or the other integration) still stores
// a grant for it would break that grant too. Best-effort: the local token is
// already gone, which is what stops OpenSEO from using it.
async function revokeIfLastGrant(accountId: string, token: string | null) {
  if (!token) return;
  if (await GoogleAccountRepository.hasDataGrantsForGoogleAccount(accountId))
    return;
  try {
    await revokeGoogleToken(token);
  } catch (error) {
    console.error("[google] token revocation failed", error);
  }
}

async function remove(input: AccountInput) {
  // A user owns their personal Google authorization even when its projects
  // belong to other organizations. Removing it releases the provider identity
  // for another OpenSEO user; it does not delete Google sign-in or other scopes.
  const token = await tokenForRevocation({
    userId: input.userId,
    providerId:
      input.provider === "gsc" ? GSC_OAUTH_PROVIDER_ID : GA4_OAUTH_PROVIDER_ID,
    accountId: input.accountId,
  });
  const gscProjectIds =
    input.provider === "gsc"
      ? await GoogleAccountRepository.listGscProjectIds(input)
      : [];
  await GoogleAccountRepository.remove(input);
  for (const projectId of gscProjectIds)
    await DashboardCacheService.deleteGscCache(projectId);
  await revokeIfLastGrant(input.accountId, token);
  return { removed: true as const };
}

/**
 * Deletes (and revokes) Search Console / Analytics grants that no project
 * uses. The grace period covers the gap between linking a Google account and
 * picking a site or property for it.
 */
async function purgeUnusedGrants(updatedBefore: Date, deadline = Infinity) {
  let purged = 0;
  // Grants left at the deadline wait for the next run.
  const grants = await GoogleAccountRepository.listUnusedGrants(
    updatedBefore,
    1000,
  );
  for (const grant of grants) {
    if (Date.now() >= deadline) break;
    const token = await tokenForRevocation(grant);
    if (!(await GoogleAccountRepository.deleteUnusedGrant(grant.id))) continue;
    purged += 1;
    await revokeIfLastGrant(grant.accountId, token);
  }
  return purged;
}

export const GoogleAccountService = {
  getRemovalImpact,
  remove,
  purgeUnusedGrants,
};
