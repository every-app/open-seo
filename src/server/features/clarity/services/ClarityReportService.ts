import {
  ClarityRepository,
  type ClarityConnection,
} from "@/server/features/clarity/repositories/ClarityRepository";
import { ClarityTokenVault } from "@/server/features/clarity/services/ClarityTokenVault";
import { prepareClarityResponseForCache } from "@/server/features/clarity/services/ClarityPrivacy";
import {
  buildClarityReportResult,
  canServeStaleClarityError,
  canServeStaleReportError,
  clarityProviderFailure,
  clarityRefreshStateChangedError,
  clarityRefreshRetryAt,
  CLARITY_REPORT_DIMENSIONS,
  isClarityCacheFresh,
  parseClarityCache,
  sharedClarityRefreshError,
  toClarityReportError,
  type ClarityReportInput,
  type ClarityReportResult,
} from "@/server/features/clarity/services/ClarityReportSupport";
import { fetchClarityReport } from "@/server/lib/clarityClient";
import { ClarityReportError } from "@/server/lib/clarityErrors";

const REFRESH_LEASE_MS = 45_000;
const REFRESH_POLL_MS = 2_000;
// An insights request can join both overview and URL refreshes in sequence.
// Three rounds at four small reads each leaves both shapes plus setup safely
// below Cloudflare D1 Free's 50-query limit for one Worker invocation.
const REFRESH_MAX_POLL_ROUNDS = 3;

const reportFlights = new Map<string, Promise<ClarityReportResult>>();

function reportIdentity(input: ClarityReportInput, connectionId: string) {
  return { ...input, connectionId };
}

function flightKey(input: ClarityReportInput, connectionId: string) {
  return [
    input.projectId,
    connectionId,
    input.reportKind,
    input.numOfDays,
  ].join(":");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retryIfConnectionChanged(
  input: ClarityReportInput,
  connection: ClarityConnection,
  replacementAttempts: number,
): Promise<ClarityReportResult | null> {
  const latest = await ClarityRepository.getConnectionByProjectId(
    input.projectId,
  );
  if (!latest) {
    throw new ClarityReportError(
      "clarity_not_connected",
      "Microsoft Clarity is not connected for this project.",
    );
  }
  if (latest.id === connection.id) return null;
  if (replacementAttempts >= 1) {
    throw new ClarityReportError(
      "clarity_upstream_unavailable",
      "Microsoft Clarity changed while the report was loading. Try again shortly.",
      2,
    );
  }
  return getReportForConnection(input, latest, replacementAttempts + 1);
}

async function reportForSharedFailure(input: {
  reportInput: ClarityReportInput;
  connection: ClarityConnection;
  replacementAttempts: number;
  cache: ReturnType<typeof parseClarityCache>;
  state: { errorCode: string | null; expiresAt: string };
  now: Date;
}): Promise<ClarityReportResult | null> {
  if (!input.state.errorCode) return null;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (Date.parse(input.state.expiresAt) - input.now.getTime()) / 1_000,
    ),
  );
  const error = sharedClarityRefreshError(
    input.state.errorCode,
    retryAfterSeconds,
  );
  if (!error) return null;
  if (input.cache && canServeStaleReportError(error)) {
    const replacement = await retryIfConnectionChanged(
      input.reportInput,
      input.connection,
      input.replacementAttempts,
    );
    if (replacement) return replacement;
    return buildClarityReportResult({
      ...input.reportInput,
      metrics: input.cache.data,
      fetchedAt: input.cache.fetchedAt,
      hit: true,
      stale: true,
      extraWarnings: ["shared_refresh_failure"],
    });
  }
  throw error;
}

async function waitForConcurrentRefresh(
  input: ClarityReportInput,
  connection: ClarityConnection,
  replacementAttempts: number,
): Promise<ClarityReportResult> {
  const identity = reportIdentity(input, connection.id);

  for (let pollRound = 0; pollRound < REFRESH_MAX_POLL_ROUNDS; pollRound += 1) {
    await delay(REFRESH_POLL_MS);
    const replacement = await retryIfConnectionChanged(
      input,
      connection,
      replacementAttempts,
    );
    if (replacement) return replacement;

    const cache = parseClarityCache(
      await ClarityRepository.getCachedReport(identity),
    );
    if (cache && isClarityCacheFresh(cache.fetchedAt)) {
      const finalReplacement = await retryIfConnectionChanged(
        input,
        connection,
        replacementAttempts,
      );
      if (finalReplacement) return finalReplacement;
      return buildClarityReportResult({
        ...input,
        metrics: cache.data,
        fetchedAt: cache.fetchedAt,
        hit: true,
        stale: false,
        extraWarnings: ["shared_refresh_joined"],
      });
    }

    const now = new Date();
    const [state, connectionFailure] = await Promise.all([
      ClarityRepository.getReportRefreshState({
        ...identity,
        now: now.toISOString(),
      }),
      ClarityRepository.getConnectionRefreshFailure({
        projectId: input.projectId,
        connectionId: connection.id,
        now: now.toISOString(),
      }),
    ]);
    if (!state && !connectionFailure) {
      // Do not restart the whole join loop inside the same invocation. A
      // cross-isolate owner may have released or replaced the lease between
      // our reads; recursively joining again can exceed D1 Free's 50-query
      // limit under sustained lease churn. The caller can retry cleanly.
      throw clarityRefreshStateChangedError();
    }
    const effectiveState = connectionFailure ?? state;
    if (!effectiveState) continue;
    const sharedReport = await reportForSharedFailure({
      reportInput: input,
      connection,
      replacementAttempts,
      cache,
      state: effectiveState,
      now,
    });
    if (sharedReport) return sharedReport;
    if (!state?.errorCode) continue;
    throw clarityRefreshStateChangedError();
  }

  throw new ClarityReportError(
    "clarity_upstream_unavailable",
    "Microsoft Clarity is still refreshing this report. Try again shortly.",
    2,
  );
}

async function getReportForConnection(
  input: ClarityReportInput,
  connection: ClarityConnection,
  replacementAttempts: number,
): Promise<ClarityReportResult> {
  const identity = reportIdentity(input, connection.id);
  const cache = parseClarityCache(
    await ClarityRepository.getCachedReport(identity),
  );
  if (cache && isClarityCacheFresh(cache.fetchedAt)) {
    const replacement = await retryIfConnectionChanged(
      input,
      connection,
      replacementAttempts,
    );
    if (replacement) return replacement;
    return buildClarityReportResult({
      ...input,
      metrics: cache.data,
      fetchedAt: cache.fetchedAt,
      hit: true,
      stale: false,
    });
  }

  const refreshCheckAt = new Date();
  const connectionFailure = await ClarityRepository.getConnectionRefreshFailure(
    {
      projectId: input.projectId,
      connectionId: connection.id,
      now: refreshCheckAt.toISOString(),
    },
  );
  if (connectionFailure) {
    const sharedReport = await reportForSharedFailure({
      reportInput: input,
      connection,
      replacementAttempts,
      cache,
      state: connectionFailure,
      now: refreshCheckAt,
    });
    if (sharedReport) return sharedReport;
  }

  const now = new Date();
  const leaseId = await ClarityRepository.claimReportRefresh({
    ...identity,
    now: now.toISOString(),
    expiresAt: new Date(now.getTime() + REFRESH_LEASE_MS).toISOString(),
  });
  if (!leaseId) {
    const replacement = await retryIfConnectionChanged(
      input,
      connection,
      replacementAttempts,
    );
    if (replacement) return replacement;
    return waitForConcurrentRefresh(input, connection, replacementAttempts);
  }

  let keepLeaseForCooldown = false;
  try {
    let apiToken: string;
    try {
      apiToken = await ClarityTokenVault.decrypt(connection.encryptedApiToken);
    } catch {
      throw new ClarityReportError(
        "clarity_reconnect_required",
        "The saved Microsoft Clarity token can no longer be decrypted. Reconnect Clarity.",
      );
    }

    const prefetchReplacement = await retryIfConnectionChanged(
      input,
      connection,
      replacementAttempts,
    );
    if (prefetchReplacement) return prefetchReplacement;

    try {
      const metrics = prepareClarityResponseForCache(
        await fetchClarityReport({
          apiToken,
          numOfDays: input.numOfDays,
          dimensions: CLARITY_REPORT_DIMENSIONS[input.reportKind],
        }),
      );
      const fetchedAt = new Date().toISOString();
      let saved: boolean;
      try {
        saved = await ClarityRepository.upsertCachedReportIfCurrent({
          ...identity,
          responseJson: JSON.stringify(metrics),
          fetchedAt,
        });
      } catch (error) {
        const replacement = await retryIfConnectionChanged(
          input,
          connection,
          replacementAttempts,
        );
        if (replacement) return replacement;
        // The provider request already consumed quota. Extend a small lease row
        // so a deterministic cache-write failure cannot spend another request
        // every few seconds. If even that write fails, retain the 45s lease.
        try {
          keepLeaseForCooldown =
            await ClarityRepository.recordReportRefreshFailure({
              ...identity,
              leaseId,
              errorCode: "clarity_storage_unavailable",
              retryAt: clarityRefreshRetryAt(
                new ClarityReportError(
                  "clarity_storage_unavailable",
                  "Microsoft Clarity storage is temporarily unavailable.",
                ),
                new Date(),
              ),
            });
        } catch {
          keepLeaseForCooldown = true;
        }
        throw error;
      }
      if (!saved) {
        const replacement = await retryIfConnectionChanged(
          input,
          connection,
          replacementAttempts,
        );
        if (replacement) return replacement;
        throw new ClarityReportError(
          "clarity_upstream_unavailable",
          "Microsoft Clarity changed while the report was loading. Try again shortly.",
          2,
        );
      }

      const postfetchReplacement = await retryIfConnectionChanged(
        input,
        connection,
        replacementAttempts,
      );
      if (postfetchReplacement) return postfetchReplacement;
      return buildClarityReportResult({
        ...input,
        metrics,
        fetchedAt,
        hit: false,
        stale: false,
      });
    } catch (error) {
      const sharedFailure = clarityProviderFailure(error);
      if (sharedFailure) {
        try {
          keepLeaseForCooldown =
            await ClarityRepository.recordReportRefreshFailure({
              ...identity,
              leaseId,
              errorCode: sharedFailure.code,
              retryAt: clarityRefreshRetryAt(sharedFailure, new Date()),
            });
        } catch {
          // The provider call already consumed quota. Preserve our existing
          // 45-second lease when the cooldown write itself fails so an
          // immediate retry cannot spend another request.
          keepLeaseForCooldown = true;
        }
      }
      const failureReplacement =
        sharedFailure && !keepLeaseForCooldown
          ? await retryIfConnectionChanged(
              input,
              connection,
              replacementAttempts,
            )
          : null;
      if (failureReplacement) return failureReplacement;
      if (cache && canServeStaleClarityError(error)) {
        const replacement = await retryIfConnectionChanged(
          input,
          connection,
          replacementAttempts,
        );
        if (replacement) return replacement;
        return buildClarityReportResult({
          ...input,
          metrics: cache.data,
          fetchedAt: cache.fetchedAt,
          hit: true,
          stale: true,
        });
      }
      throw toClarityReportError(error);
    }
  } finally {
    if (!keepLeaseForCooldown) {
      try {
        await ClarityRepository.releaseReportRefresh({ ...identity, leaseId });
      } catch {
        // The lease expires after 45 seconds. A cleanup failure must not hide a
        // valid report (or the original provider error), and Drizzle errors can
        // contain bound values, so keep the log deliberately value-free.
        console.warn("[clarity] Failed to release report refresh lease.");
      }
    }
  }
}

async function getReportWithFlight(
  input: ClarityReportInput,
): Promise<ClarityReportResult> {
  const connection = await ClarityRepository.getConnectionByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new ClarityReportError(
      "clarity_not_connected",
      "Microsoft Clarity is not connected for this project.",
    );
  }

  const key = flightKey(input, connection.id);
  const existing = reportFlights.get(key);
  if (existing) return existing;

  const flight = getReportForConnection(input, connection, 0);
  reportFlights.set(key, flight);
  try {
    return await flight;
  } finally {
    if (reportFlights.get(key) === flight) reportFlights.delete(key);
  }
}

export async function getClarityReport(input: ClarityReportInput) {
  try {
    return await getReportWithFlight(input);
  } catch (error) {
    throw toClarityReportError(error);
  }
}
