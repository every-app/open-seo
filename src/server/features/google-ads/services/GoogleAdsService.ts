import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import { createGoogleAdsClient } from "@/server/lib/googleAdsClient";
import {
  GoogleAdsConfigError,
  errorLogDetails,
} from "@/server/lib/googleAdsErrors";
import { GOOGLE_ADS_OAUTH_PROVIDER_ID } from "@/shared/google-ads";
import {
  GoogleAdsConnectionRepository,
  type GoogleAdsConnection,
} from "@/server/features/google-ads/repositories/GoogleAdsConnectionRepository";
import {
  accessPending,
  listAccountsForGrant,
  requiresReconnect,
  verifyAccountForGrant,
} from "@/server/features/google-ads/services/googleAdsAccountDiscovery";

async function getConnection(
  projectId: string,
): Promise<GoogleAdsConnection | null> {
  return GoogleAdsConnectionRepository.getByProjectId(projectId);
}

async function listGrantsForUser(userId: string) {
  return db
    .select({
      id: account.id,
      accountId: account.accountId,
      scope: account.scope,
    })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GOOGLE_ADS_OAUTH_PROVIDER_ID),
      ),
    );
}

async function userHasGrant(userId: string): Promise<boolean> {
  const grants = await listGrantsForUser(userId);
  return grants.length > 0;
}

async function grantExists(
  userId: string,
  googleAdsAccountId: string,
): Promise<boolean> {
  const grants = await listGrantsForUser(userId);
  return grants.some((grant) => grant.accountId === googleAdsAccountId);
}

async function listAccountsForUserWithGrantStatus(userId: string) {
  const grants = await listGrantsForUser(userId);
  const accounts = await Promise.all(
    grants.map(async (grant) => {
      console.info("google_ads.grant_discovery", {
        googleAccountId: grant.accountId,
        scope: grant.scope ?? null,
      });
      const client = createGoogleAdsClient({
        userId,
        googleAdsAccountId: grant.accountId,
      });
      try {
        const discovered = await listAccountsForGrant({
          userId,
          googleAdsAccountId: grant.accountId,
        });
        let email: string | null = null;
        try {
          email = await client.getUserInfoEmail();
        } catch {
          email = null;
        }
        return {
          accountId: grant.accountId,
          email,
          requiresReconnect: false,
          accessPending: false,
          setupRequired: false,
          accountsUnavailable: false,
          truncated: discovered.truncated,
          accounts: discovered.accounts,
        };
      } catch (error) {
        const reconnect = requiresReconnect(error);
        const pending = accessPending(error);
        // A missing developer token is this deployment's own setup gap, not
        // Google taking its time on approval. Same empty picker, but the two
        // need different copy or the self-hoster waits for nothing.
        const setupRequired = error instanceof GoogleAdsConfigError;
        if (!reconnect && !pending && !setupRequired) {
          console.error(
            "google_ads.account_discovery_failed",
            errorLogDetails(error),
          );
        }
        return {
          accountId: grant.accountId,
          email: null,
          requiresReconnect: reconnect,
          accessPending: pending,
          setupRequired,
          accountsUnavailable: !reconnect && !pending && !setupRequired,
          truncated: false,
          accounts: [],
        };
      }
    }),
  );
  return { accounts };
}

async function setAccount(input: {
  projectId: string;
  organizationId: string;
  accountId: string;
  customerId: string;
  loginCustomerId: string | null;
  userId: string;
}): Promise<GoogleAdsConnection> {
  if (!(await grantExists(input.userId, input.accountId))) {
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your OpenSEO account.",
    );
  }
  const candidate = await verifyAccountForGrant({
    userId: input.userId,
    googleAdsAccountId: input.accountId,
    customerId: input.customerId,
    loginCustomerId: input.loginCustomerId,
  });

  const client = createGoogleAdsClient({
    userId: input.userId,
    googleAdsAccountId: input.accountId,
  });
  let connectedAccountEmail: string | null = null;
  try {
    connectedAccountEmail = await client.getUserInfoEmail();
  } catch {
    connectedAccountEmail = null;
  }

  const connection = await GoogleAdsConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    customerId: candidate.customerId,
    loginCustomerId: candidate.loginCustomerId,
    customerDescriptiveName: candidate.descriptiveName,
    currencyCode: candidate.currencyCode,
    timeZone: candidate.timeZone,
    connectedByUserId: input.userId,
    googleAdsAccountId: input.accountId,
    connectedAccountEmail,
  });
  // Verification above is a couple of Google round trips. Disconnecting another
  // project that shares this Google login releases the grant, so it can vanish
  // inside that window — leaving a saved connection whose refresh token is
  // already gone. Undo rather than store a dead link.
  if (!(await grantExists(input.userId, input.accountId))) {
    await GoogleAdsConnectionRepository.deleteByProjectId(input.projectId);
    throw new AppError(
      "NOT_FOUND",
      "That Google account was disconnected while saving. Reconnect and try again.",
    );
  }
  return connection;
}

async function disconnect(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const connection = await GoogleAdsConnectionRepository.getByProjectId(
    input.projectId,
  );
  await GoogleAdsConnectionRepository.deleteByProjectId(input.projectId);
  if (connection && connection.connectedByUserId === input.userId) {
    await GoogleAdsConnectionRepository.unlinkGrantIfUnused(
      input.userId,
      connection.googleAdsAccountId,
    );
  }
}

export const GoogleAdsService = {
  getConnection,
  userHasGrant,
  listAccountsForUserWithGrantStatus,
  setAccount,
  disconnect,
};
