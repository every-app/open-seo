/**
 * One place that turns "validate this" into a result, shared by the
 * `validate_structured_data` MCP tool and the Structured Data page.
 *
 * Deliberately thin and storage-free: spec 0012 keeps no history for spot
 * checks. Failure modes are returned rather than thrown, because each one is a
 * message the caller renders, not a fault.
 */
import { readPageHtml } from "@/server/lib/scrape";
import {
  validateHtml,
  validateMarkup,
} from "@/server/lib/structured-data/validate";
import type { ValidationResult } from "@/server/lib/structured-data/types";

export type StructuredDataFailureReason =
  /** Neither markup nor url was given. */
  | "no_input"
  /** Both were given — validating a snippet and a live page are different questions. */
  | "ambiguous_input"
  /** The URL could not be read (unreachable, blocked, oversized, or private). */
  | "fetch_failed";

type StructuredDataValidation =
  | { ok: true; source: string; result: ValidationResult }
  | { ok: false; reason: StructuredDataFailureReason; source?: string };

/** What the source is called in the summary when markup was pasted in. */
const SUPPLIED_MARKUP_SOURCE = "supplied markup";

async function validate(input: {
  markup?: string;
  url?: string;
}): Promise<StructuredDataValidation> {
  const markup = input.markup?.trim();
  const url = input.url?.trim();

  if (!markup && !url) return { ok: false, reason: "no_input" };
  if (markup && url) return { ok: false, reason: "ambiguous_input" };

  if (url) {
    const html = await readPageHtml(url);
    if (html === null) {
      return { ok: false, reason: "fetch_failed", source: url };
    }
    return { ok: true, source: url, result: await validateHtml(html) };
  }

  return {
    ok: true,
    source: SUPPLIED_MARKUP_SOURCE,
    result: await validateMarkup(markup ?? ""),
  };
}

export const StructuredDataService = { validate };
