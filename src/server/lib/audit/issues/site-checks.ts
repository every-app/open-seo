/**
 * Site-level issue checks — findings about the site as a whole rather than any
 * one page. Unlike the per-page reporters these may perform one extra fetch for
 * a well-known root resource, so the impure entry point is kept thin and every
 * decision lives in a pure predicate that tests can drive without a network.
 *
 * Site-level issues carry `pageId: null` and the site origin as `pageUrl`
 * (the issues table allows a null page reference but requires a URL).
 */
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";

const FETCH_HEADERS = { "User-Agent": "OpenSEO-Audit/1.0" } as const;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * robots-parser only exposes the directives it knows about, so an emerging
 * one like `Schemamap:` has to be read off the raw text. Matches a directive
 * at the start of a line, which is where robots.txt directives live.
 */
export function robotsDeclaresSchemamap(robotsText: string | null): boolean {
  if (!robotsText) return false;
  return /^[^\S\r\n]*schemamap[^\S\r\n]*:/im.test(robotsText);
}

/**
 * A site advertises a schemamap either by serving /schemamap.xml or by
 * pointing at one from robots.txt. Absence is an opportunity, not a defect —
 * the convention is young — so this only reports when neither signal is there.
 */
export function detectSchemamapMissing(input: {
  origin: string;
  robotsText: string | null;
  schemamapServed: boolean;
}): DetectedIssue[] {
  if (input.schemamapServed || robotsDeclaresSchemamap(input.robotsText)) {
    return [];
  }
  return [
    {
      issueType: "schemamap-missing",
      pageId: null,
      pageUrl: input.origin,
    },
  ];
}

/**
 * True only for a definite 2xx. A network error or timeout returns false, which
 * would surface the issue on a site that does serve one — acceptable for an
 * info-level finding, and the alternative (suppressing on error) hides it for
 * every site whose root is briefly unreachable.
 */
async function fetchServesSchemamap(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/schemamap.xml`, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // Drain so the connection can be reused; we only care about the status.
    await response.body?.cancel();
    return response.ok;
  } catch (error) {
    console.warn("Failed to fetch schemamap.xml:", error);
    return false;
  }
}

export async function runSiteChecks(input: {
  origin: string;
  robotsText: string | null;
}): Promise<DetectedIssue[]> {
  const schemamapServed = await fetchServesSchemamap(input.origin);
  return detectSchemamapMissing({ ...input, schemamapServed });
}
