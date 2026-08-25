import { parse as parseTld } from "tldts";
import { z } from "zod";

/**
 * True when `host` resolves to a real registrable domain (public-suffix list),
 * rejecting IPs and fake TLDs like `example.por` before they reach DataForSEO.
 */
export function isValidDomainHost(host: string): boolean {
  const parsed = parseTld(host, { allowPrivateDomains: true });
  return (
    !parsed.isIp &&
    !!parsed.publicSuffix &&
    (parsed.isIcann === true || parsed.isPrivate === true)
  );
}

/**
 * Research scope for any URL/domain input:
 * - exact_url:  one normalized page URL only
 * - subfolder:  the selected path and its children (not similarly named siblings)
 * - domain:     the selected hostname, excluding its subdomains
 * - subdomains: the selected hostname and all of its subdomains
 */
export const RESEARCH_SCOPES = [
  "exact_url",
  "subfolder",
  "domain",
  "subdomains",
] as const;

export type ResearchScope = (typeof RESEARCH_SCOPES)[number];

export const researchScopeSchema = z.enum(RESEARCH_SCOPES);

export const RESEARCH_SCOPE_LABELS: Record<ResearchScope, string> = {
  exact_url: "Exact URL",
  subfolder: "Subfolder",
  domain: "Domain",
  subdomains: "Subdomains",
};

/** Base wording for MCP `scope` params; tools append their own caveats. */
export const RESEARCH_SCOPE_PARAM_DESCRIPTION =
  "Research scope: 'domain' (hostname without subdomains), 'subdomains' (hostname plus all subdomains), 'subfolder' (path and its children), or 'exact_url' (one page). Defaults to 'subdomains' for root inputs and 'subfolder' when the input has a path.";

/** One-line explanations shown in the scope dropdown. */
export const RESEARCH_SCOPE_DESCRIPTIONS: Record<ResearchScope, string> = {
  exact_url: "One page only",
  subfolder: "The path and everything under it",
  domain: "The hostname, without subdomains",
  subdomains: "The domain plus all its subdomains",
};

/** Wildcard-style pattern examples shown under each scope option. */
export const RESEARCH_SCOPE_EXAMPLES: Record<ResearchScope, string> = {
  exact_url: "example.com/path",
  subfolder: "example.com/path/*",
  domain: "example.com/*",
  subdomains: "*.example.com/*",
};

export type ResearchTarget = {
  scope: ResearchScope;
  /** Lowercased hostname with a leading `www.` stripped. */
  hostname: string;
  /** Hostname as entered (lowercased, `www.` preserved) for building page URLs. */
  urlHostname: string;
  /**
   * Normalized path: `""` for the root, otherwise `/like/This` — casing and
   * percent-encoding preserved, trailing slashes / query / fragment stripped.
   */
  path: string;
  /** What to show users: hostname, plus the path for URL-scoped research. */
  display: string;
};

type ParseResearchTargetResult =
  | { ok: true; target: ResearchTarget }
  | { ok: false; message: string };

function normalizePath(pathname: string): string {
  if (pathname === "/") return "";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "" : trimmed;
}

/** A subfolder needs a non-root path; every other scope works for any input. */
export function isScopeAllowedForInput(
  scope: ResearchScope,
  path: string,
): boolean {
  return scope !== "subfolder" || path !== "";
}

/** Root inputs default to subdomains scope; inputs with a path to subfolder. */
export function defaultScopeForPath(path: string): ResearchScope {
  return path === "" ? "subdomains" : "subfolder";
}

/** Scope implied by the input itself; unparseable input falls back to domain. */
export function defaultScopeForInput(input: string): ResearchScope {
  const parsed = parseResearchTarget(input);
  return parsed.ok ? parsed.target.scope : "domain";
}

/**
 * Scope as persisted in URLs and history: omitted when it matches the input's
 * implied default, so shared links re-derive the same scope.
 */
export function toScopeSearchParam(
  input: string,
  scope: ResearchScope,
): ResearchScope | undefined {
  return scope === defaultScopeForInput(input) ? undefined : scope;
}

export function parseResearchTarget(
  input: string,
  requestedScope?: ResearchScope,
): ParseResearchTargetResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a domain or URL" };
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, message: "Enter a valid domain like example.com" };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "URLs with embedded credentials are not supported",
    };
  }

  const urlHostname = parsed.hostname.toLowerCase();
  const hostname = urlHostname.replace(/^www\./, "");
  // The charset check rejects hosts like my_site.com that URL() and tldts
  // accept but DataForSEO bills and fails with an opaque "Invalid Field".
  if (
    !hostname ||
    !hostname.includes(".") ||
    !/^[a-z\d.-]+$/.test(hostname) ||
    !isValidDomainHost(hostname)
  ) {
    return { ok: false, message: "Enter a valid domain like example.com" };
  }

  // Query strings and fragments never create separate research scopes.
  const path = normalizePath(parsed.pathname);

  if (requestedScope === "subfolder" && path === "") {
    return {
      ok: false,
      message: "Add a path to use Subfolder (e.g. example.com/blog)",
    };
  }

  const scope = requestedScope ?? defaultScopeForPath(path);

  const usesPath = scope === "exact_url" || scope === "subfolder";
  return {
    ok: true,
    target: {
      scope,
      hostname,
      urlHostname,
      path,
      display: usesPath ? `${hostname}${path}` : hostname,
    },
  };
}

/**
 * How many of DataForSEO's 8 filter conditions each scope consumes on the
 * Labs endpoints (see buildRankedKeywordsScopeFilter / buildRelevantPagesScopeFilter).
 * The client uses this to shrink the user-facing filter budget.
 */
export const RESEARCH_SCOPE_FILTER_SLOTS: Record<
  "keywords" | "pages",
  Record<ResearchScope, number>
> = {
  keywords: { exact_url: 4, subfolder: 4, domain: 1, subdomains: 0 },
  pages: { exact_url: 4, subfolder: 4, domain: 2, subdomains: 0 },
};

/** Conditions the backlinks subfolder url_to/url prefix group consumes. */
export const BACKLINKS_SUBFOLDER_FILTER_CONDITIONS = 4;

function hostMatches(candidateHost: string, target: ResearchTarget): boolean {
  const host = candidateHost.toLowerCase().replace(/^www\./, "");
  if (target.scope === "subdomains") {
    return host === target.hostname || host.endsWith(`.${target.hostname}`);
  }
  return host === target.hostname;
}

/**
 * Whether a result URL belongs to the research target. Used to post-filter
 * provider rows that cannot be scoped provider-side. Subfolder matching
 * includes the path and its children but excludes similarly named siblings
 * (`/blog` matches `/blog/post`, not `/blogging`).
 */
export function urlMatchesResearchTarget(
  url: string,
  target: ResearchTarget,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!hostMatches(parsed.hostname, target)) return false;

  const path = normalizePath(parsed.pathname);
  switch (target.scope) {
    case "exact_url":
      return path === target.path;
    case "subfolder":
      return path === target.path || path.startsWith(`${target.path}/`);
    default:
      return true;
  }
}
