import { AppError } from "@/server/lib/errors";
import {
  resolveBacklinksScope,
  type BacklinksScopeWithLegacy,
} from "@/types/schemas/backlinks";
import {
  parseResearchTarget,
  type ResearchScope,
} from "@/shared/researchScope";

type NormalizedBacklinkTarget = {
  apiTarget: string;
  displayTarget: string;
  scope: ResearchScope;
  /** DataForSEO `include_subdomains`; ignored by the API for page targets. */
  includeSubdomains: boolean;
  /**
   * Subfolder scope only: the normalized path driving the url_to/url prefix
   * filters (the API itself has no prefix targeting). `""` for other scopes.
   */
  path: string;
};

type NormalizeBacklinksTargetOptions = {
  scope?: BacklinksScopeWithLegacy;
};

/**
 * Backlinks-flavored wrapper over the shared research-target parser. The
 * backlinks-specific rules: an exact-URL target is sent as an absolute URL
 * (preserving an explicit http:// scheme, since url matching is exact) and
 * rejects query strings/fragments instead of silently stripping them.
 */
export function normalizeBacklinksTarget(
  input: string,
  options: NormalizeBacklinksTargetOptions = {},
): NormalizedBacklinkTarget {
  const trimmed = input.trim();
  const requestedScope = options.scope
    ? resolveBacklinksScope(options.scope)
    : undefined;

  const parsed = parseResearchTarget(trimmed, requestedScope);
  if (!parsed.ok) {
    throw new AppError("VALIDATION_ERROR", parsed.message);
  }
  const target = parsed.target;

  if (target.scope !== "exact_url") {
    return {
      apiTarget: target.hostname,
      displayTarget:
        target.scope === "subfolder" ? target.display : target.hostname,
      scope: target.scope,
      includeSubdomains: target.scope === "subdomains",
      path: target.scope === "subfolder" ? target.path : "",
    };
  }

  // Query strings and fragments would target a different page than the one
  // the user sees, so a page lookup rejects them rather than dropping them.
  if (/[?#]/.test(trimmed)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Page URLs with query strings or fragments are not supported",
    );
  }

  const protocol = /^http:\/\//i.test(trimmed) ? "http" : "https";
  const pageUrl = `${protocol}://${target.urlHostname}${target.path || "/"}`;
  return {
    apiTarget: pageUrl,
    displayTarget: pageUrl,
    scope: "exact_url",
    // Irrelevant for a page target; kept true so the payload is unchanged.
    includeSubdomains: true,
    path: "",
  };
}
