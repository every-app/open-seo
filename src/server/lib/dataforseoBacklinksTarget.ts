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
    normalizedUrl.hostname = exactHostname;
    if (!hasExplicitProtocol && !hasMeaningfulPath) {
      normalizedUrl.pathname = "/";
    }
    return {
      apiTarget: normalizedUrl.toString(),
      displayTarget: normalizedUrl.toString(),
      scope: "page",
    };
  }

  if (hasExplicitProtocol || hasMeaningfulPath) {
    const normalizedUrl = new URL(parsed.toString());
    normalizedUrl.hostname = exactHostname;
    return {
      apiTarget: normalizedUrl.toString(),
      displayTarget: normalizedUrl.toString(),
      scope: "page",
    };
  }

  return {
    apiTarget: domainHostname,
    displayTarget: domainHostname,
    scope: "domain",
  };
}
