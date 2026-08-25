import { getDomain } from "tldts";
import { AppError } from "@/server/lib/errors";
import {
  isValidDomainHost,
  parseResearchTarget,
  type ResearchScope,
  type ResearchTarget,
} from "@/shared/researchScope";

export function parseResearchTargetOrThrow(
  input: string,
  scope?: ResearchScope,
): ResearchTarget {
  const parsed = parseResearchTarget(input, scope);
  if (!parsed.ok) {
    throw new AppError("VALIDATION_ERROR", parsed.message);
  }
  return parsed.target;
}

export function toRelativePath(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return null;
  }
}

export function normalizeDomainInput(
  input: string,
  includeSubdomains: boolean,
): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "Domain is required");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new AppError("VALIDATION_ERROR", "Domain is invalid");
  }

  if (!host) {
    throw new AppError("VALIDATION_ERROR", "Domain is invalid");
  }

  // Reject fake TLDs / non-registrable hosts (e.g. "example.por") before they
  // reach DataForSEO and come back as an opaque "Invalid Field: 'target'".
  if (!isValidDomainHost(host)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enter a valid domain like example.com",
    );
  }

  if (includeSubdomains) {
    return host;
  }

  return getDomain(host) ?? host;
}
