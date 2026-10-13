import {
  fetchRankCheckTaskHtml,
  type PostedRankCheckTask,
  type RankCheckResult,
  type RankCheckTaskInput,
} from "@/server/lib/dataforseo";
import type {
  CheckContext,
  RankCheckResultWithDevice,
} from "@/server/workflows/rankCheckPaths";

// What a validated run checks each collected result against before it is
// written: the page that produced it, and the keyword/device pair's own recent
// history. Used by rankCheckQueuedPath; validateCollected runs inside a step
// body there, so it reads only its arguments.

/** A queued task with the number of crawls spent on its keyword/device pair. */
export type QueuedTask = PostedRankCheckTask & { attempt: number };

export const pairKey = (task: RankCheckTaskInput) =>
  `${task.keywordId}:${task.device}`;

// Fork: Google's page carries this module when it did not apply the requested
// location to the organic ranking (the organic list is then the national one);
// a page with the location applied shows "Choose area" instead. English text,
// so RankTrackingService.triggerCheck refuses validated runs in other languages.
const LOCATION_DROPPED_MARKER = /Use precise location/i;

// A task's page HTML is up to ten Google result pages, so far fewer of those
// are read at once than the small advanced JSON results.
const HTML_FETCH_CONCURRENCY = 5;

// Fork: the second check a validated run applies. A page Google served without
// the location does not always carry the chip module above (the queue path
// mostly gets pages that look precise and still list the national ranking),
// but it always reads wrong against the keyword's own recent history: a pair
// that ranked well is suddenly absent, far lower, or ranks a different page
// below its usual one.
const HISTORY_DROP_TOLERANCE = 8;
const HISTORY_RANKED_CEILING = 20;

/** A pair's recent ranked history: its best position and the page that held it. */
export interface PairBaseline {
  bestPosition: number;
  bestUrl: string | null;
}

type HistoryRow = {
  trackingKeywordId: string;
  device: string;
  position: number | null;
  url: string | null;
};

export function buildBaselines(rows: HistoryRow[]): Map<string, PairBaseline> {
  const baselines = new Map<string, PairBaseline>();
  for (const row of rows) {
    if (row.position === null) continue;
    const key = `${row.trackingKeywordId}:${row.device}`;
    const current = baselines.get(key);
    if (!current || row.position < current.bestPosition) {
      baselines.set(key, { bestPosition: row.position, bestUrl: row.url });
    }
  }
  return baselines;
}

const normalizePageUrl = (url: string) =>
  url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");

function samePage(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return normalizePageUrl(a) === normalizePageUrl(b);
}

function offHistory(
  result: RankCheckResult,
  baseline: PairBaseline | undefined,
): boolean {
  if (!baseline || baseline.bestPosition > HISTORY_RANKED_CEILING) return false;
  if (result.position === null) return true;
  if (result.position > baseline.bestPosition + HISTORY_DROP_TOLERANCE) {
    return true;
  }
  return (
    result.position > baseline.bestPosition &&
    !samePage(result.url, baseline.bestUrl)
  );
}

type PageVerdict = "localized" | "dropped" | "unread";

async function readPageVerdict(taskId: string): Promise<PageVerdict> {
  const read = await fetchRankCheckTaskHtml(taskId);
  if (read.status === "pending") return "unread";
  return read.pages.some((html) => LOCATION_DROPPED_MARKER.test(html))
    ? "dropped"
    : "localized";
}

/**
 * Validated runs: check each completed result against its own page and
 * against the pair's recent history. Either failing makes the result dropped
 * instead of written. A page that cannot be read yet keeps the task pending,
 * so it is read again next round rather than written unchecked.
 */
export async function validateCollected(
  ctx: CheckContext,
  items: Array<{ task: QueuedTask; result: RankCheckResult }>,
  baselines: Map<string, PairBaseline>,
) {
  const completed: RankCheckResultWithDevice[] = [];
  const dropped: QueuedTask[] = [];
  const unread: QueuedTask[] = [];
  let validated = 0;
  let historySuspect = 0;
  for (let i = 0; i < items.length; i += HTML_FETCH_CONCURRENCY) {
    const slice = items.slice(i, i + HTML_FETCH_CONCURRENCY);
    const verdicts = await Promise.allSettled(
      slice.map(({ task }) => readPageVerdict(task.taskId)),
    );
    verdicts.forEach((verdict, index) => {
      const { task, result } = slice[index];
      const outcome: PageVerdict =
        verdict.status === "fulfilled" ? verdict.value : "unread";
      if (outcome === "dropped") {
        console.warn(
          `[rank-check] ${ctx.runId} task ${task.taskId} page shows Google dropped the location (attempt ${task.attempt}) keyword="${task.keyword}" device=${task.device}`,
        );
        dropped.push(task);
        return;
      }
      if (
        outcome === "localized" &&
        offHistory(result, baselines.get(pairKey(task)))
      ) {
        historySuspect++;
        console.warn(
          `[rank-check] ${ctx.runId} task ${task.taskId} reading is off the pair's recent history (attempt ${task.attempt}) keyword="${task.keyword}" device=${task.device} position=${result.position} url=${result.url}`,
        );
        dropped.push(task);
        return;
      }
      if (outcome === "unread") {
        console.warn(
          `[rank-check] ${ctx.runId} task ${task.taskId} page not readable yet, reading again next round`,
          verdict.status === "rejected" ? verdict.reason : "",
        );
        unread.push(task);
        return;
      }
      validated++;
      completed.push({ ...result, device: task.device });
    });
  }
  return { completed, dropped, unread, validated, historySuspect };
}
