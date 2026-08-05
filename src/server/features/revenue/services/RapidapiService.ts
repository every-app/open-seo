import {
  RapidapiSnapshotRepository,
  type RapidapiSnapshot,
} from "@/server/features/revenue/repositories/RapidapiSnapshotRepository";

/**
 * Manually-logged RapidAPI subscriber snapshots, copied from Studio
 * Analytics. RapidAPI has no platform API for public-marketplace subscriber
 * data (confirmed by support 2026-08-04), so trend-over-snapshots replaces
 * the live query. Counts only — no subscriber identities. See specs/0014.
 */

/** RapidAPI's flat marketplace commission on subscription revenue. */
export const RAPIDAPI_FEE_RATE = 0.25;

export type RapidapiSnapshotReport = {
  latest: RapidapiSnapshot | null;
  previous: RapidapiSnapshot | null;
  /** latest minus previous; null without two snapshots (or, for paying,
   *  when either snapshot skipped the paying split). */
  activeDelta: number | null;
  payingDelta: number | null;
  /** paying × plan price from the latest snapshot, USD cents; null when
   *  either wasn't recorded. Net deducts RapidAPI's flat 25% fee. */
  grossMrrUsdMinor: number | null;
  netMrrUsdMinor: number | null;
};

/** Deltas between the two most recent snapshots — exported for tests.
 *  `snapshots` must be sorted by capturedOn descending (repository order). */
export function buildSnapshotReport(
  snapshots: RapidapiSnapshot[],
): RapidapiSnapshotReport {
  const latest = snapshots[0] ?? null;
  const previous = snapshots[1] ?? null;
  const grossMrrUsdMinor =
    latest?.payingSubscribers != null && latest.planPriceUsdMinor != null
      ? latest.payingSubscribers * latest.planPriceUsdMinor
      : null;
  return {
    latest,
    previous,
    activeDelta:
      latest && previous
        ? latest.activeSubscribers - previous.activeSubscribers
        : null,
    payingDelta:
      latest?.payingSubscribers != null && previous?.payingSubscribers != null
        ? latest.payingSubscribers - previous.payingSubscribers
        : null,
    grossMrrUsdMinor,
    netMrrUsdMinor:
      grossMrrUsdMinor === null
        ? null
        : Math.round(grossMrrUsdMinor * (1 - RAPIDAPI_FEE_RATE)),
  };
}

async function listSnapshots(projectId: string): Promise<{
  snapshots: RapidapiSnapshot[];
  report: RapidapiSnapshotReport;
}> {
  const snapshots = await RapidapiSnapshotRepository.listByProjectId(projectId);
  return { snapshots, report: buildSnapshotReport(snapshots) };
}

/** Record (or overwrite) one day's numbers as read off Studio Analytics. */
async function logSnapshot(input: {
  projectId: string;
  organizationId: string;
  capturedOn: string;
  activeSubscribers: number;
  payingSubscribers: number | null;
  planPriceUsdMinor: number | null;
  userId: string;
}): Promise<RapidapiSnapshot> {
  return RapidapiSnapshotRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    capturedOn: input.capturedOn,
    activeSubscribers: input.activeSubscribers,
    payingSubscribers: input.payingSubscribers,
    planPriceUsdMinor: input.planPriceUsdMinor,
    createdByUserId: input.userId,
  });
}

async function deleteSnapshot(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  await RapidapiSnapshotRepository.deleteById(input.projectId, input.id);
}

export const RapidapiService = {
  listSnapshots,
  logSnapshot,
  deleteSnapshot,
};
