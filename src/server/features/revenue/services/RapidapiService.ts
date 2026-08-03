import { AppError } from "@/server/lib/errors";
import {
  createRapidapiClient,
  type RapidapiSubscription,
} from "@/server/lib/rapidapiClient";
import {
  RapidapiConnectionRepository,
  type RapidapiConnection,
} from "@/server/features/revenue/repositories/RapidapiConnectionRepository";

/** Thrown when a project has no connected RapidAPI listing. */
export class RapidapiNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("RapidAPI is not connected for this project");
    this.name = "RapidapiNotConnectedError";
  }
}

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RapidapiMetrics = {
  /** Subscriptions that are not canceled. */
  activeSubscribers: number;
  /** Active subscriptions on a plan with price > 0; null when the hub's
   *  schema doesn't expose plan info (see planInfoAvailable). */
  payingSubscribers: number | null;
  newLast30: number;
  newPrev30: number;
  churnedLast30: number;
  churnedPrev30: number;
};

// Live statuses observed 2026-08-03: ACTIVE, plus DELETED for both canceled
// and plan-switched rows (DELETED can appear with canceledAt null), so only
// an explicit ACTIVE counts. A null status is trusted as active.
function isActive(sub: RapidapiSubscription): boolean {
  if (sub.canceledAt) return false;
  return !sub.status || sub.status.toUpperCase() === "ACTIVE";
}

/** Keep only nodes that belong to the requested API. The Platform API
 *  silently ignores an unrecognized where.apiId and returns the caller's own
 *  subscriptions (verified live 2026-08-03) — trusting the filter would show
 *  the wrong data. Nodes without an api id (older schema variants) are kept. */
export function scopeToApi(
  subscriptions: RapidapiSubscription[],
  apiId: string,
): RapidapiSubscription[] {
  return subscriptions.filter(
    (sub) => sub.apiId === null || sub.apiId === apiId,
  );
}

function inWindow(iso: string | null, since: number, until: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= since && time < until;
}

/** Pure metric computation over the full subscription list — exported for
 *  tests. Windows are the last 30 days and the 30 days before that. */
export function computeRapidapiMetrics(
  subscriptions: RapidapiSubscription[],
  planInfoAvailable: boolean,
  now: Date,
): RapidapiMetrics {
  const until = now.getTime() + DAY_MS; // include today
  const since = until - WINDOW_DAYS * DAY_MS;
  const prevSince = since - WINDOW_DAYS * DAY_MS;
  const active = subscriptions.filter(isActive);
  return {
    activeSubscribers: active.length,
    payingSubscribers: planInfoAvailable
      ? active.filter((sub) => (sub.planPrice ?? 0) > 0).length
      : null,
    newLast30: subscriptions.filter((sub) =>
      inWindow(sub.createdAt, since, until),
    ).length,
    newPrev30: subscriptions.filter((sub) =>
      inWindow(sub.createdAt, prevSince, since),
    ).length,
    churnedLast30: subscriptions.filter((sub) =>
      inWindow(sub.canceledAt, since, until),
    ).length,
    churnedPrev30: subscriptions.filter((sub) =>
      inWindow(sub.canceledAt, prevSince, since),
    ).length,
  };
}

async function getConnection(
  projectId: string,
): Promise<RapidapiConnection | null> {
  return RapidapiConnectionRepository.getByProjectId(projectId);
}

/** Map a RapidAPI listing to an OpenSEO project. Validated by running the
 *  subscriptions query — a bad apiId fails here instead of creating a dead
 *  connection. A wrong id doesn't error upstream (the filter is silently
 *  ignored), so the check is that the returned nodes actually belong to the
 *  requested API. */
async function setApi(input: {
  projectId: string;
  organizationId: string;
  rapidapiApiId: string;
  userId: string;
}): Promise<RapidapiConnection> {
  let apiName: string | null = null;
  try {
    const result = await createRapidapiClient().getSubscriptions(
      input.rapidapiApiId,
    );
    const scoped = scopeToApi(result.subscriptions, input.rapidapiApiId);
    if (result.subscriptions.length > 0 && scoped.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "That API id didn't match any of the returned subscriptions — RapidAPI ignores unknown ids instead of erroring. Check it against your provider dashboard (the id starting with 'api_').",
      );
    }
    apiName = scoped.map((sub) => sub.apiName).find((name) => name) ?? null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "NOT_FOUND",
      "RapidAPI rejected that API id. Check it against your provider dashboard (the id starting with 'api_').",
    );
  }
  return RapidapiConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    rapidapiApiId: input.rapidapiApiId,
    rapidapiApiName: apiName,
    connectedByUserId: input.userId,
  });
}

async function disconnect(projectId: string): Promise<void> {
  await RapidapiConnectionRepository.deleteByProjectId(projectId);
}

/** The RapidAPI panel payload: subscriber counts with 30-day new/churn and
 *  the most recent subscription events. */
async function getSubscriptionReport(input: { projectId: string }) {
  const connection = await RapidapiConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new RapidapiNotConnectedError(input.projectId);
  }
  const result = await createRapidapiClient().getSubscriptions(
    connection.rapidapiApiId,
  );
  const scoped = scopeToApi(result.subscriptions, connection.rapidapiApiId);
  const metrics = computeRapidapiMetrics(
    scoped,
    result.planInfoAvailable,
    new Date(),
  );
  const recent = scoped
    .toSorted((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 10);
  return {
    rapidapiApiId: connection.rapidapiApiId,
    apiName:
      scoped.map((sub) => sub.apiName).find((name) => name) ??
      connection.rapidapiApiName,
    planInfoAvailable: result.planInfoAvailable,
    totalCount: scoped.length,
    metrics,
    recent,
  };
}

export const RapidapiService = {
  getConnection,
  setApi,
  disconnect,
  getSubscriptionReport,
};
