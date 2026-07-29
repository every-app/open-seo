import { AppError } from "@/server/lib/errors";
import { getJsonFromR2, putTextToR2 } from "@/server/lib/r2";
import {
  readStoredPagespeedPayload,
  type StoredPagespeedIssue,
  type StoredPagespeedPayload,
} from "@/server/lib/pagespeedStoredPayload";
import { latestByUrl, type PagespeedTrigger } from "@/shared/pagespeed";
import {
  createPagespeedClient,
  hasPagespeedApiKey,
  isExpectedPagespeedFailure,
  type PagespeedStrategy,
} from "@/server/lib/pagespeedClient";
import {
  PagespeedUrlRepository,
  type PsiUrl,
} from "@/server/features/pagespeed/repositories/PagespeedUrlRepository";
import {
  PagespeedSnapshotRepository,
  type PsiSnapshot,
  type PsiSnapshotInsert,
} from "@/server/features/pagespeed/repositories/PagespeedSnapshotRepository";

/** Thrown when PAGESPEED_API_KEY is not configured on the instance. */
export class PagespeedNotConfiguredError extends Error {
  constructor() {
    super("PageSpeed Insights is not configured on this instance");
    this.name = "PagespeedNotConfiguredError";
  }
}

/** Both strategies run for every URL, so each run costs 2 API calls. */
const PAGESPEED_STRATEGIES: readonly PagespeedStrategy[] = [
  "mobile",
  "desktop",
];

/** Bounds quota use and how long a "run all" takes. */
export const MAX_URLS_PER_PROJECT = 10;

/** How much history the overview loads — the page's charts read from this,
 *  so it must cover every monitored URL, not just the selected one. */
const PROJECT_SNAPSHOT_LIMIT = 500;

type PagespeedOverview = {
  urls: PsiUrl[];
  snapshots: PsiSnapshot[];
};

/** Normalize user input to an absolute http(s) URL, or reject it. Strips the
 *  fragment (PSI ignores it) but keeps the query, which can change the page. */
export function normalizePagespeedUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enter a full URL, including https://",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only http and https URLs can be tested",
    );
  }
  parsed.hash = "";
  return parsed.toString();
}

/** The homepage URL implied by a project's domain, or null when it has none.
 *  projects.domain is nullable and may already carry a scheme. */
export function homepageUrlForDomain(domain: string | null): string | null {
  const trimmed = domain?.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.origin + "/";
  } catch {
    return null;
  }
}

async function requireConfigured(): Promise<void> {
  if (!(await hasPagespeedApiKey())) {
    throw new PagespeedNotConfiguredError();
  }
}

/** Monitored URLs plus recent history. Seeds the project homepage on first
 *  load so a new project has something to run without any setup. */
async function getOverview(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  domain: string | null;
}): Promise<PagespeedOverview> {
  await requireConfigured();

  let urls = await PagespeedUrlRepository.listByProjectId(input.projectId);
  if (urls.length === 0) {
    const homepage = homepageUrlForDomain(input.domain);
    if (homepage) {
      await PagespeedUrlRepository.insert({
        projectId: input.projectId,
        organizationId: input.organizationId,
        url: homepage,
        isHomepage: true,
        createdByUserId: input.userId,
      });
      urls = await PagespeedUrlRepository.listByProjectId(input.projectId);
    }
  }

  const snapshots = await PagespeedSnapshotRepository.listByProjectId(
    input.projectId,
    PROJECT_SNAPSHOT_LIMIT,
  );
  return { urls, snapshots };
}

async function addUrl(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  url: string;
}): Promise<PsiUrl> {
  await requireConfigured();
  const url = normalizePagespeedUrl(input.url);

  const existing = await PagespeedUrlRepository.listByProjectId(
    input.projectId,
  );
  if (existing.some((row) => row.url === url)) {
    throw new AppError("CONFLICT", "That URL is already being monitored");
  }
  if (existing.length >= MAX_URLS_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `You can monitor up to ${MAX_URLS_PER_PROJECT} URLs per project. Remove one first.`,
    );
  }

  const created = await PagespeedUrlRepository.insert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    url,
    isHomepage: false,
    createdByUserId: input.userId,
  });
  if (!created) {
    // A concurrent add claimed this URL between the check above and the write.
    throw new AppError("CONFLICT", "That URL is already being monitored");
  }
  return created;
}

async function removeUrl(input: {
  projectId: string;
  urlId: string;
}): Promise<void> {
  // Snapshots cascade with the URL row.
  await PagespeedUrlRepository.deleteByIdForProject(
    input.urlId,
    input.projectId,
  );
}

/** Run both strategies for one URL and store a snapshot for each. A strategy
 *  that fails is stored as an error row rather than aborting the other, so a
 *  desktop failure never hides a good mobile result. */
async function runForUrl(input: {
  projectId: string;
  urlId: string;
  trigger?: PagespeedTrigger;
}): Promise<PsiSnapshot[]> {
  await requireConfigured();

  const target = await PagespeedUrlRepository.getByIdForProject(
    input.urlId,
    input.projectId,
  );
  if (!target) {
    throw new AppError(
      "NOT_FOUND",
      "That URL is not monitored by this project",
    );
  }

  const client = createPagespeedClient();
  const results = await Promise.all(
    PAGESPEED_STRATEGIES.map(async (strategy): Promise<PsiSnapshotInsert> => {
      const base = {
        urlId: target.id,
        projectId: input.projectId,
        strategy,
        trigger: input.trigger ?? "manual",
      };
      try {
        const { result, payloadJson } = await client.runPagespeed({
          url: target.url,
          strategy,
        });
        // Store the drill-down payload before the row, so a row never
        // advertises an r2Key that isn't there. A failed upload costs the
        // drill-down, not the metrics.
        const stored = payloadJson
          ? await storePayload({
              projectId: input.projectId,
              urlId: target.id,
              strategy,
              payloadJson,
            })
          : null;
        return {
          ...base,
          ...result,
          errorMessage: null,
          r2Key: stored?.key ?? null,
          payloadSizeBytes: stored?.sizeBytes ?? null,
        };
      } catch (error) {
        return {
          ...base,
          errorMessage: describeRunFailure(error),
        };
      }
    }),
  );

  return PagespeedSnapshotRepository.insertMany(results);
}

/**
 * Upload one run's drill-down payload. A failure here must not lose the run:
 * the metric columns are independently useful, so this logs and returns null
 * rather than throwing and turning a good run into an error row.
 */
async function storePayload(input: {
  projectId: string;
  urlId: string;
  strategy: string;
  payloadJson: string;
}): Promise<{ key: string; sizeBytes: number } | null> {
  // Mirrors the site-audit key convention:
  // <feature>/<projectId>/<runId>/<entity>-<variant>.json
  const key = `pagespeed/${input.projectId}/${input.urlId}/${input.strategy}-${Date.now()}.json`;
  try {
    return await putTextToR2(key, input.payloadJson);
  } catch (error) {
    console.error(`[psi] Failed to store payload ${key}:`, error);
    return null;
  }
}

/** Failure text stored on an error snapshot row. Expected failures already
 *  carry user-facing copy; anything else is recorded generically. */
function describeRunFailure(error: unknown): string {
  if (isExpectedPagespeedFailure(error) && error instanceof Error) {
    return error.message;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "PageSpeed Insights did not respond in time. Try again.";
  }
  return error instanceof Error
    ? error.message
    : "PageSpeed Insights run failed";
}

/**
 * The stored drill-down for one run: the Lighthouse opportunities and
 * diagnostics behind a score. Runs from before payload storage — and runs whose
 * upload failed — have no r2Key, which the caller surfaces as "re-run to see
 * details" rather than an error.
 */
async function getSnapshotIssues(input: {
  projectId: string;
  snapshotId: string;
}): Promise<StoredPagespeedPayload | null> {
  const snapshot = await PagespeedSnapshotRepository.getByIdForProject(
    input.snapshotId,
    input.projectId,
  );
  if (!snapshot) {
    throw new AppError("NOT_FOUND", "That PageSpeed run does not exist");
  }
  if (!snapshot.r2Key) return null;
  return readStoredPagespeedPayload(await getJsonFromR2(snapshot.r2Key));
}

/** One monitored URL's latest run, with its stored issues if any were kept. */
export type LatestIssuesForUrl = {
  url: string;
  snapshotId: string;
  runAt: string;
  /** False when the run predates detail capture, failed, or lost its upload. */
  available: boolean;
  issues: StoredPagespeedIssue[];
};

/**
 * The stored issues for the latest run of each monitored URL.
 *
 * Resolves snapshots itself so callers never need a snapshot id — an agent
 * asking "what should I fix" has a URL, not an id. Each URL's payload is read
 * independently and a failed read degrades that URL to `available: false`
 * rather than failing the whole call.
 */
async function getLatestIssues(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  domain: string | null;
  strategy: string;
  urlFilter?: string;
}): Promise<LatestIssuesForUrl[]> {
  const overview = await getOverview(input);
  const filter = input.urlFilter?.toLowerCase();
  const urls = filter
    ? overview.urls.filter((row) => row.url.toLowerCase().includes(filter))
    : overview.urls;

  const latest = latestByUrl(overview.snapshots, input.strategy);

  return Promise.all(
    urls.flatMap((url) => {
      const entry = latest.get(url.id);
      if (!entry) return [];
      const { snapshot } = entry;
      const base = {
        url: url.url,
        snapshotId: snapshot.id,
        runAt: snapshot.createdAt,
      };
      if (!snapshot.r2Key) {
        return [
          Promise.resolve({
            ...base,
            available: false,
            issues: [] as StoredPagespeedIssue[],
          }),
        ];
      }
      return [
        getJsonFromR2(snapshot.r2Key)
          .then((json) => ({
            ...base,
            available: true,
            issues: readStoredPagespeedPayload(json).issues,
          }))
          .catch((error: unknown) => {
            console.error(`[psi] Failed to read ${snapshot.r2Key}:`, error);
            return { ...base, available: false, issues: [] };
          }),
      ];
    }),
  );
}

export const PagespeedService = {
  getOverview,
  addUrl,
  removeUrl,
  runForUrl,
  getSnapshotIssues,
  getLatestIssues,
};
