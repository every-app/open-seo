import { isErrorCode } from "@/shared/error-codes";

// Query params that never carry customer content. Every other param is
// dropped: app URLs carry keywords, domains, competitor lists, AI prompts, GSC
// filters, emails and full OAuth requests in their query strings, none of which
// may reach analytics. Route paths only hold opaque ids, so they are kept.
const ALLOWED_QUERY_PARAMETERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "tab",
  "view",
]);

// Autocapture records link targets even with attribute masking on, and an
// app link can point at a customer's page (a GSC row, a backlink source).
const HREF_ATTRIBUTE = /(?:attr__)?href="(?:[^"\\]|\\.)*"/g;

type PostHogEvent = {
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
};

/** Strips every non-allowlisted query param and the hash from an absolute
 *  http(s) URL or a root-relative path. Other strings pass through unchanged. */
export function sanitizePostHogUrl(value: string): string {
  const isPath = value.startsWith("/") && !value.startsWith("//");
  let url: URL;
  try {
    url = new URL(value, isPath ? "https://path.invalid" : undefined);
  } catch {
    return value;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return value;

  url.search = new URLSearchParams(
    Array.from(url.searchParams).filter(([key]) =>
      ALLOWED_QUERY_PARAMETERS.has(key),
    ),
  ).toString();
  url.hash = "";
  return isPath ? url.pathname + url.search : url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Nested values too: each web vitals metric carries its own copy of the page
// URL.
function sanitizeNested(value: unknown): unknown {
  if (typeof value === "string") return sanitizePostHogUrl(value);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => sanitizeNested(item));
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      value[key] = sanitizeNested(nested);
    }
  }
  return value;
}

/** Removes customer content from an outgoing event: URL query strings in
 *  event and person properties, link targets on autocaptured elements, and
 *  exception messages. */
export function sanitizePostHogEvent<T extends PostHogEvent>(event: T): T {
  const { properties } = event;
  sanitizeNested(properties);
  if (event.$set) sanitizeNested(event.$set);
  if (event.$set_once) sanitizeNested(event.$set_once);

  // Heatmaps key their click positions by page URL.
  if (isRecord(properties.$heatmap_data)) {
    const byUrl: Record<string, unknown[]> = {};
    for (const [url, points] of Object.entries(properties.$heatmap_data)) {
      const merged = (byUrl[sanitizePostHogUrl(url)] ??= []);
      if (Array.isArray(points)) {
        points.forEach((point: unknown) => merged.push(point));
      }
    }
    properties.$heatmap_data = byUrl;
  }

  delete properties.$external_click_url;
  if (typeof properties.$elements_chain === "string") {
    properties.$elements_chain = properties.$elements_chain.replace(
      HREF_ATTRIBUTE,
      "",
    );
  }
  if (Array.isArray(properties.$elements)) {
    properties.$elements.forEach((element: unknown) => {
      if (typeof element === "object" && element !== null) {
        Reflect.deleteProperty(element, "attr__href");
      }
    });
  }
  // Error tracking keeps each exception's type and stack frames. A message
  // can quote page content (a JSON snippet, a URL); a bare error code can't.
  if (Array.isArray(properties.$exception_list)) {
    properties.$exception_list.forEach((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return;
      const value: unknown = Reflect.get(entry, "value");
      if (typeof value !== "string" || !isErrorCode(value)) {
        Reflect.set(entry, "value", "");
      }
    });
  }
  return event;
}
