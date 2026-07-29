import { AppError } from "@/server/lib/errors";
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
export const PAGESPEED_STRATEGIES: readonly PagespeedStrategy[] = [
  "mobile",
  "desktop",
];

/** Bounds quota use and how long a "run all" takes. */
export const MAX_URLS_PER_PROJECT = 10;

/** How much history the overview loads. 10 URLs x 2 strategies x ~25 runs. */
const PROJECT_SNAPSHOT_LIMIT = 500;

/** Trend history per URL, both strategies interleaved. */
const URL_SNAPSHOT_LIMIT = 120;

export type PagespeedOverview = {
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
    throw new AppError("VALIDATION_ERROR", "Only http and https URLs can be tested");
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

  return PagespeedUrlRepository.insert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    url,
    isHomepage: false,
    createdByUserId: input.userId,
  });
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
}): Promise<PsiSnapshot[]> {
  await requireConfigured();

  const target = await PagespeedUrlRepository.getByIdForProject(
    input.urlId,
    input.projectId,
  );
  if (!target) {
    throw new AppError("NOT_FOUND", "That URL is not monitored by this project");
  }

  const client = createPagespeedClient();
  const results = await Promise.all(
    PAGESPEED_STRATEGIES.map(async (strategy): Promise<PsiSnapshotInsert> => {
      const base = {
        urlId: target.id,
        projectId: input.projectId,
        strategy,
      };
      try {
        const result = await client.runPagespeed({
          url: target.url,
          strategy,
        });
        return { ...base, ...result, errorMessage: null };
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

/** Recent snapshots for one URL, newest first — the trend chart's source. */
async function getUrlHistory(input: {
  projectId: string;
  urlId: string;
}): Promise<PsiSnapshot[]> {
  const target = await PagespeedUrlRepository.getByIdForProject(
    input.urlId,
    input.projectId,
  );
  if (!target) {
    throw new AppError("NOT_FOUND", "That URL is not monitored by this project");
  }
  return PagespeedSnapshotRepository.listByUrlId(target.id, URL_SNAPSHOT_LIMIT);
}

export const PagespeedService = {
  getOverview,
  addUrl,
  removeUrl,
  runForUrl,
  getUrlHistory,
};
