import { TrackingRepository as repo } from "../repositories/TrackingRepository";
import {
  isCited,
  isIndexed,
  positionOf,
  siteQuery,
  urlHost,
} from "./trackingMatch";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  createDataforseoClient,
  fetchSerpTaskResult,
  type SerpLiveItem,
} from "@/server/lib/dataforseo";
import { PS_TRACKING_DEPTH } from "@/shared/platform-seo";

type Scope = {
  projectId: string;
  organizationId: string;
  // The project's market, for topics added before topics kept their own.
  locationCode: number;
  languageCode: string;
};

// One click checks at most this many copies (two queued reads each).
const MAX_PER_CHECK = 25;
// Queued reads finish in minutes and DataForSEO keeps the results for days,
// so a check is collected whenever the page next opens; one whose reads still
// aren't back after this gave up.
const GIVE_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
// The posting call writes each task id after the rows. Queued reads take
// minutes anyway, so collection leaves a fresh check alone this long and never
// reads one that is half posted.
const POSTING_GRACE_MS = 2 * 60 * 1000;

type Published = Awaited<ReturnType<typeof repo.listPublished>>[number];
type Snapshot = Awaited<ReturnType<typeof repo.listLatestSnapshots>>[number];

const ageMs = (iso: string) => Date.now() - Date.parse(iso);

// Each copy's latest check of each kind.
function latestByCopy(snapshots: Snapshot[]) {
  const out = new Map<
    string,
    { pending?: Snapshot; done?: Snapshot; failed?: Snapshot }
  >();
  for (const snapshot of snapshots) {
    const entry = out.get(snapshot.syndicationId) ?? {};
    entry[snapshot.status] = snapshot;
    out.set(snapshot.syndicationId, entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Starting checks: rows first, then the paid reads, grouped by market
// ---------------------------------------------------------------------------
type PlannedCheck = {
  id: string;
  copy: Published;
  keyword: string | null;
  locationCode: number;
  languageCode: string;
};

async function postGroup(
  customer: BillingCustomerContext,
  checks: PlannedCheck[],
  kind: "rank" | "index",
) {
  const [first] = checks;
  const posted = await createDataforseoClient(customer).serp.rankCheckTaskPost({
    tasks: checks.map((check) => ({
      keyword:
        kind === "rank"
          ? (check.keyword ?? "")
          : siteQuery(check.copy.liveUrl ?? ""),
      keywordId: check.id,
      device: "desktop",
    })),
    locationCode: first.locationCode,
    languageCode: first.languageCode,
    depth: kind === "rank" ? PS_TRACKING_DEPTH : 10,
  });
  await repo.setTaskIds(
    kind,
    posted.map((task) => ({ snapshotId: task.keywordId, taskId: task.taskId })),
  );
  return new Set(posted.map((task) => task.keywordId));
}

async function startChecks(params: {
  scope: Scope;
  customer: BillingCustomerContext;
  syndicationIds?: string[];
}) {
  const published = await repo.listPublished(
    params.scope,
    params.syndicationIds,
  );
  const latest = latestByCopy(
    await repo.listLatestSnapshots(params.scope, params.syndicationIds),
  );
  // A copy with a check still running waits for it. The rest go never-checked
  // first, then longest since their last check, so repeated clicks work
  // through every copy rather than the newest ones again.
  const lastTried = (copy: Published) => {
    const entry = latest.get(copy.syndicationId);
    const times = [entry?.done?.requestedAt, entry?.failed?.requestedAt].filter(
      (time): time is string => Boolean(time),
    );
    times.sort();
    return times.at(-1) ?? "";
  };
  const due = published.filter(
    (copy) => !latest.get(copy.syndicationId)?.pending,
  );
  due.sort((a, b) => lastTried(a).localeCompare(lastTried(b)));
  const planned: PlannedCheck[] = due.slice(0, MAX_PER_CHECK).map((copy) => ({
    id: crypto.randomUUID(),
    copy,
    keyword: copy.primaryKeyword?.trim().toLowerCase() || null,
    locationCode: copy.locationCode ?? params.scope.locationCode,
    languageCode: copy.languageCode ?? params.scope.languageCode,
  }));

  const requestedAt = new Date().toISOString();
  const inserted = new Set(
    await repo.insertPending(
      planned.map((check) => ({
        id: check.id,
        syndicationId: check.copy.syndicationId,
        keyword: check.keyword,
        locationCode: check.locationCode,
        languageCode: check.languageCode,
        requestedAt,
      })),
    ),
  );
  // Only the rows this call inserted are posted: another start that got in
  // first already owns the rest.
  const checks = planned.filter((check) => inserted.has(check.id));
  const alreadyRunning =
    published.length - checks.length - (due.length - planned.length);
  if (checks.length === 0) {
    return { started: 0, alreadyRunning, failed: 0 };
  }

  const groups = new Map<string, PlannedCheck[]>();
  for (const check of checks) {
    const key = `${check.locationCode}|${check.languageCode}`;
    groups.set(key, [...(groups.get(key) ?? []), check]);
  }
  const posted = new Set<string>();
  let failure: unknown = null;
  for (const group of groups.values()) {
    for (const kind of ["rank", "index"] as const) {
      const toPost =
        kind === "rank" ? group.filter((check) => check.keyword) : group;
      if (toPost.length === 0) continue;
      try {
        for (const id of await postGroup(params.customer, toPost, kind)) {
          posted.add(id);
        }
      } catch (error) {
        failure ??= error;
      }
    }
  }
  // A check none of whose reads went out has nothing to collect.
  const unposted = checks.filter((check) => !posted.has(check.id));
  for (const check of unposted) {
    await repo.finish(check.id, {
      status: "failed",
      indexed: null,
      ranked: null,
      googlePosition: null,
      aiCited: null,
    });
  }
  // Nothing posted (no credits, DataForSEO down): the caller hears why.
  if (posted.size === 0 && failure) throw failure;
  return {
    started: posted.size,
    alreadyRunning,
    failed: unposted.length,
  };
}

// ---------------------------------------------------------------------------
// Collecting: free task_get reads, then the free AI-source lookup
// ---------------------------------------------------------------------------
type Read =
  | { state: "pending" }
  | { state: "done"; items: SerpLiveItem[] | null };

async function readTask(taskId: string | null): Promise<Read> {
  if (!taskId) return { state: "done", items: null };
  const outcome = await fetchSerpTaskResult(taskId).catch(() => ({
    status: "pending" as const,
  }));
  if (outcome.status === "pending") return { state: "pending" };
  return {
    state: "done",
    items: outcome.status === "completed" ? outcome.items : null,
  };
}

async function collect(scope: Scope) {
  const pending = (await repo.listLatestSnapshots(scope)).filter(
    (snapshot) => snapshot.status === "pending",
  );
  if (pending.length === 0) return { pending: 0 };
  const published = await repo.listPublished(
    scope,
    pending.map((snapshot) => snapshot.syndicationId),
  );
  const byId = new Map(published.map((copy) => [copy.syndicationId, copy]));

  const hosts = [
    ...new Set(
      published.flatMap((copy) => {
        const host = urlHost(copy.liveUrl ?? "");
        return host ? [host, `www.${host}`] : [];
      }),
    ),
  ];
  const sourceUrls = await repo.listAiSourceUrls(scope.projectId, hosts);

  let stillPending = 0;
  for (const snapshot of pending) {
    const liveUrl = byId.get(snapshot.syndicationId)?.liveUrl;
    if (ageMs(snapshot.requestedAt) < POSTING_GRACE_MS) {
      stillPending++;
      continue;
    }
    const [rank, index] = liveUrl
      ? await Promise.all([
          readTask(snapshot.rankTaskId),
          readTask(snapshot.indexTaskId),
        ])
      : [null, null];
    if (!liveUrl || !rank || !index) {
      await repo.finish(snapshot.id, FAILED);
      continue;
    }
    if (rank.state === "pending" || index.state === "pending") {
      // Paid results are kept waiting for; only reads still missing after
      // days are given up.
      if (ageMs(snapshot.requestedAt) > GIVE_UP_AFTER_MS) {
        await repo.finish(snapshot.id, FAILED);
      } else {
        stillPending++;
      }
      continue;
    }
    // A keyword whose read is missing or failed is unknown, never "not
    // ranking".
    const googlePosition = rank.items ? positionOf(rank.items, liveUrl) : null;
    const ranked =
      snapshot.keyword && rank.items ? googlePosition !== null : null;
    await repo.finish(snapshot.id, {
      status: "done",
      // Ranking for its keyword proves it's indexed whatever site: says.
      indexed:
        googlePosition !== null
          ? true
          : index.items
            ? isIndexed(index.items, liveUrl)
            : null,
      ranked,
      googlePosition,
      aiCited: isCited(sourceUrls, liveUrl),
    });
  }
  return { pending: stillPending };
}

const FAILED = {
  status: "failed",
  indexed: null,
  ranked: null,
  googlePosition: null,
  aiCited: null,
} as const;

// ---------------------------------------------------------------------------
// The pipeline: counts per stage and every published copy's latest check
// ---------------------------------------------------------------------------
async function getPipeline(scope: Scope) {
  const [counts, published, snapshots] = await Promise.all([
    repo.stageCounts(scope),
    repo.listPublished(scope),
    repo.listLatestSnapshots(scope),
  ]);
  const latest = latestByCopy(snapshots);
  const copies = published.map((copy) => {
    const { pending, done, failed } = latest.get(copy.syndicationId) ?? {};
    return {
      ...copy,
      checking: pending !== undefined,
      // The last try failed after (or without) a good result.
      lastCheckFailed:
        failed !== undefined &&
        (!done || failed.requestedAt > done.requestedAt),
      lastCheck: done
        ? {
            checkedAt: done.checkedAt,
            keyword: done.keyword,
            indexed: done.indexed,
            ranked: done.ranked,
            googlePosition: done.googlePosition,
            aiCited: done.aiCited,
          }
        : null,
    };
  });
  const checked = copies.flatMap((copy) =>
    copy.lastCheck ? [copy.lastCheck] : [],
  );
  const topicCount = (status: string) =>
    counts.topics.find((row) => row.status === status)?.n ?? 0;
  const articleCount = (status?: string) =>
    counts.articles
      .filter((row) => !status || row.status === status)
      .reduce((total, row) => total + row.n, 0);
  const copyCount = (status?: string) =>
    counts.copies
      .filter((row) => !status || row.status === status)
      .reduce((total, row) => total + row.n, 0);

  return {
    stages: {
      keywords: counts.keywords,
      clusters: counts.clusters,
      topics: counts.topics.reduce((total, row) => total + row.n, 0),
      briefs: counts.briefs,
      articles: articleCount(),
      ready: articleCount("ready"),
      copies: copyCount(),
      published: copyCount("published"),
      checked: checked.length,
      indexed: checked.filter((c) => c.indexed === true).length,
      notIndexed: checked.filter((c) => c.indexed === false).length,
      ranking: checked.filter((c) => c.ranked === true).length,
      pageOne: checked.filter(
        (c) => c.ranked === true && (c.googlePosition ?? 99) <= 10,
      ).length,
      cited: checked.filter((c) => c.aiCited).length,
    },
    topicsByStatus: {
      idea: topicCount("idea"),
      drafting: topicCount("drafting"),
      ready: topicCount("ready"),
      published: topicCount("published"),
    },
    copies,
    maxPerCheck: MAX_PER_CHECK,
  };
}

export const TrackingService = {
  startChecks,
  collect,
  getPipeline,
} as const;
