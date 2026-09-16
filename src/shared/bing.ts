/** Bing Webmaster Tools REST JSON API. Auth is a per-user API key (generated
 *  at bing.com/webmasters -> Settings -> API Access), appended as `apikey` on
 *  every call — never OAuth like GSC/GA4. Kept in `shared` so both server (the
 *  client) and client (setup docs link) can reference it without importing
 *  server-only code. */
export const BING_WEBMASTER_API_BASE =
  "https://ssl.bing.com/webmaster/api.svc/json";

export const BING_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_BING_WEBMASTER.md";

export const BING_GET_API_KEY_URL =
  "https://www.bing.com/webmasters/home/mysites";

/** Parse Bing's `/Date(1316156400000-0700)/` wire format into an ISO string.
 *  The timezone offset segment is informational only — the embedded value is
 *  already epoch milliseconds in UTC, so it is ignored (matches how every
 *  other Bing Webmaster API client treats this field). Returns null for a
 *  value that doesn't match the expected shape rather than throwing, since a
 *  malformed date shouldn't take down an entire report. */
export function parseBingDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  if (!match) return null;
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
