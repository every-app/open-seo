import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";
import { readBoundedText } from "@/server/lib/scrape";

// IndexNow engines share every submission with each other, so one accepted
// request reaches all of them. Bing goes first as the largest participant. Bing
// and some other engines rate-limit shared hosting IPs, including Cloudflare
// Workers', so a rate limit, server error or timeout moves on to the next one.
const INDEXNOW_ENDPOINTS = [
  "https://www.bing.com/indexnow",
  "https://yandex.com/indexnow",
  "https://indexnow.yep.com/indexnow",
];
const REQUEST_TIMEOUT_MS = 10_000;

interface ProjectScope {
  projectId: string;
  organizationId: string;
}

interface IndexNowHostResult {
  host: string;
  urlCount: number;
  status: "submitted" | "failed";
  message: string;
}

async function loadProject(scope: ProjectScope) {
  const project = await ProjectRepository.getProjectForOrganization(
    scope.projectId,
    scope.organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");
  return project;
}

async function getSetup(scope: ProjectScope) {
  const project = await loadProject(scope);
  return { domain: project.domain, key: project.indexnowKey };
}

/** The project's key, created on first use. The project needs a website. */
async function setUp(scope: ProjectScope) {
  const project = await loadProject(scope);
  if (!project.domain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add the project's website before using IndexNow.",
    );
  }
  if (project.indexnowKey) {
    return { domain: project.domain, key: project.indexnowKey, created: false };
  }
  await ProjectRepository.setIndexNowKeyIfMissing(
    scope.projectId,
    scope.organizationId,
    crypto.randomUUID().replaceAll("-", ""),
  );
  // Re-read: a concurrent first use may have saved its key instead.
  const saved = await loadProject(scope);
  if (!saved.indexnowKey) throw new AppError("NOT_FOUND");
  return { domain: project.domain, key: saved.indexnowKey, created: true };
}

type KeyFileStatus =
  | "found"
  | "missing"
  | "wrong_content"
  | "redirects"
  // Redirects to the same file on another host, like a bare domain that
  // forwards everything to www. Its pages live on that other host.
  | "moved"
  | "unreachable"
  // A bot wall, server error, timeout or stalled body: the file may be fine.
  | "unknown";

async function checkKeyFile(host: string, key: string): Promise<KeyFileStatus> {
  const url = `https://${host}/${key}.txt`;
  let response: Response;
  try {
    response = await fetch(await normalizeAndValidateStartUrl(url), {
      headers: { "user-agent": "OpenSEO-IndexNow/1.0 (+https://openseo.so)" },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError"
      ? "unknown"
      : "unreachable";
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if (response.status === 404 || response.status === 410) return "missing";
    if (response.status >= 300 && response.status < 400) {
      const target = URL.parse(response.headers.get("location") ?? "", url);
      return target &&
        target.hostname !== host &&
        target.pathname === `/${key}.txt`
        ? "moved"
        : "redirects";
    }
    return "unknown";
  }
  const body = await readBoundedText(response).catch(() => undefined);
  if (body === undefined) return "unknown";
  return body?.trim() === key ? "found" : "wrong_content";
}

/**
 * Catches the setup mistakes engines would otherwise reject later: a missing
 * file, a page served in its place, or a redirect (engines want the file
 * itself). Anything inconclusive returns null and the submission goes ahead.
 */
async function findKeyFileProblem(
  host: string,
  key: string,
): Promise<string | null> {
  switch (await checkKeyFile(host, key)) {
    case "missing":
      return `No key file at the root of https://${host}. Upload it there, then try again.`;
    case "wrong_content":
      return `The key file on https://${host} should contain only the key.`;
    case "redirects":
    case "moved":
      return `The key file on https://${host} redirects. Upload it to https://${host} itself.`;
    default:
      return null;
  }
}

/** Where the key file is hosted, for the bare domain and its www host. */
async function checkKeyFiles(scope: ProjectScope) {
  const project = await loadProject(scope);
  const domain = project.domain;
  const key = project.indexnowKey;
  if (!domain || !key) return { hosts: [] };
  const hosts = await Promise.all(
    [domain, `www.${domain}`].map(async (host) => ({
      host,
      status: await checkKeyFile(host, key),
    })),
  );
  return { hosts };
}

function describeResponse(
  status: number,
  urlCount: number,
  host: string,
): Pick<IndexNowHostResult, "status" | "message"> {
  const urls = `${urlCount} URL${urlCount === 1 ? "" : "s"}`;
  switch (status) {
    case 200:
      return { status: "submitted", message: `Submitted ${urls}.` };
    case 202:
      return {
        status: "submitted",
        message: `Submitted ${urls}. Search engines will verify the key file on https://${host} first.`,
      };
    case 403:
      return {
        status: "failed",
        message: `The key wasn't accepted. Check that the key file on https://${host} contains only the key.`,
      };
    case 429:
      return {
        status: "failed",
        message:
          "Search engines are refusing submissions right now. Try again later, and only submit pages that changed.",
      };
    default:
      return {
        status: "failed",
        message: `IndexNow returned HTTP ${status}.`,
      };
  }
}

/** The engine's status code, or undefined when it didn't respond. */
async function postToEngine(
  endpoint: string,
  host: string,
  body: string,
): Promise<number | undefined> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.warn(
      `indexnow.submit ${endpoint} network error for ${host}`,
      error,
    );
    return undefined;
  }
  if (response.ok) {
    void response.body?.cancel().catch(() => {});
  } else {
    const detail = await readBoundedText(response).catch(() => null);
    console.warn(
      `indexnow.submit ${endpoint} HTTP ${response.status} for ${host}: ${detail?.slice(0, 200) ?? ""}`,
    );
  }
  return response.status;
}

async function submitHost(
  host: string,
  key: string,
  urlList: string[],
): Promise<IndexNowHostResult> {
  const base = { host, urlCount: urlList.length };
  const problem = await findKeyFileProblem(host, key);
  if (problem) return { ...base, status: "failed", message: problem };

  const body = JSON.stringify({ host, key, urlList });
  let status: number | undefined;
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    status = await postToEngine(endpoint, host, body);
    if (status !== undefined && status !== 429 && status < 500) break;
  }
  if (status === undefined) {
    return {
      ...base,
      status: "failed",
      message: "IndexNow didn't respond. Try again later.",
    };
  }
  return { ...base, ...describeResponse(status, urlList.length, host) };
}

/**
 * Sends URLs on the project's website to IndexNow, one request per host.
 * URLs off the website are skipped rather than failing the whole call.
 */
async function submitUrls(scope: ProjectScope, urls: string[]) {
  const { domain, key, created } = await setUp(scope);

  const byHost = new Map<string, Set<string>>();
  const skipped: string[] = [];
  for (const raw of urls) {
    const url = URL.parse(raw.trim());
    const host = url?.hostname ?? "";
    if (
      !url ||
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (host !== domain && !host.endsWith(`.${domain}`))
    ) {
      skipped.push(raw);
      continue;
    }
    url.hash = "";
    const hostUrls = byHost.get(host) ?? new Set<string>();
    hostUrls.add(url.toString());
    byHost.set(host, hostUrls);
  }

  const hosts: IndexNowHostResult[] = [];
  for (const [host, hostUrls] of byHost) {
    hosts.push(await submitHost(host, key, [...hostUrls]));
  }
  return { key, keyCreated: created, hosts, skipped };
}

export const IndexNowService = {
  getSetup,
  setUp,
  checkKeyFiles,
  submitUrls,
} as const;
