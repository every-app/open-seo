import { AppError } from "@/server/lib/errors";
import type { BacklinksLookupInput } from "@/types/schemas/backlinks";

type NormalizedBacklinkTarget = {
  apiTarget: string;
  displayTarget: string;
  scope: "domain" | "page";
};

type NormalizeBacklinksTargetOptions = {
  scope?: BacklinksLookupInput["scope"];
};

function normalizePageTargetUrl(url: URL, hostname: string): string {
  const normalizedUrl = new URL(url.toString());
  normalizedUrl.hostname = hostname;

  if (normalizedUrl.pathname.length > 1) {
    normalizedUrl.pathname = normalizedUrl.pathname.replace(/\/+$/, "");
  }

  return normalizedUrl.toString();
}

export function normalizeBacklinksTarget(
  input: string,
  options: NormalizeBacklinksTargetOptions = {},
): NormalizedBacklinkTarget {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "Target is required");
  }

  const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed);
  const withProtocol = hasExplicitProtocol ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Target is invalid");
  }

  const exactHostname = parsed.hostname.toLowerCase();
  const domainHostname = exactHostname.replace(/^www\./, "");
  if (!domainHostname || !domainHostname.includes(".")) {
    throw new AppError("VALIDATION_ERROR", "Target is invalid");
  }

  if (parsed.username || parsed.password) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Page URLs with embedded credentials are not supported",
    );
  }

  const hasMeaningfulPath = parsed.pathname !== "/";
  const requestedScope = options.scope;

  if (requestedScope === "domain") {
    return {
      apiTarget: domainHostname,
      displayTarget: domainHostname,
      scope: "domain",
    };
  }

  if (parsed.search || parsed.hash) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Page URLs with query strings or fragments are not supported",
    );
  }

  if (requestedScope === "page") {
    const normalizedUrl = new URL(parsed.toString());
    if (!hasExplicitProtocol && !hasMeaningfulPath) {
      normalizedUrl.pathname = "/";
    }

    const normalizedTarget = normalizePageTargetUrl(
      normalizedUrl,
      exactHostname,
    );
    return {
      apiTarget: normalizedTarget,
      displayTarget: normalizedTarget,
      scope: "page",
    };
  }

  if (hasExplicitProtocol || hasMeaningfulPath) {
    const normalizedTarget = normalizePageTargetUrl(parsed, exactHostname);
    return {
      apiTarget: normalizedTarget,
      displayTarget: normalizedTarget,
      scope: "page",
    };
  }

  return {
    apiTarget: domainHostname,
    displayTarget: domainHostname,
    scope: "domain",
  };
}
