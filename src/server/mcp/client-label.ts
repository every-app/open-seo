// Which client made this call, as a display label. It is a self-reported hint,
// never an identity: nothing authorizes, filters or bills on it, and the only
// value nothing outside the server can influence is the user id on the auth
// context. Kept a pure function in a leaf module so it is testable without the
// transport.
//
// Both signals are attacker-controlled, so the fallback is stripped to a safe
// character set and truncated.

/**
 * Cap on the stored client label. The label is derived from a fully
 * attacker-controlled `User-Agent` (or client-supplied client info), and an
 * unbounded one would land in the table, the app's list column and every
 * list_reports text block.
 */
const REPORT_MAX_CREATED_BY_CHARS = 60;

/** Verified User-Agent strings: `claude-code/2.1.259 (sdk-cli)`, `codex-mcp-client/0.149.1`. */
const KNOWN_CLIENTS: [RegExp, string][] = [
  [/^claude-code\//i, "Claude Code"],
  [/^codex-mcp-client\//i, "Codex"],
];

/**
 * What a call with no usable User-Agent and no client info is labelled. API-key
 * calls are the realistic case: they reach the same entry point as every other
 * request, carrying whatever (or no) User-Agent the caller sent.
 */
export const DEFAULT_CLIENT_LABEL = "API key";

/** Spaces are kept so a client title like "VS Code" survives; everything else is dropped. */
function sanitizeLabel(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._+\- ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, REPORT_MAX_CREATED_BY_CHARS)
    .trim();
}

export function resolveClientLabel(input: {
  userAgent?: string | null;
  /** The reserved clientInfo envelope key's `title`, when the client sends one. */
  clientTitle?: string | null;
}): string {
  const userAgent = input.userAgent?.trim() ?? "";
  for (const [pattern, label] of KNOWN_CLIENTS) {
    if (pattern.test(userAgent)) return label;
  }

  const title = sanitizeLabel(input.clientTitle ?? "");
  if (title) return title;

  // The product token only: "curl/8.4.0" is a client, "8.4.0" is noise.
  const productToken = sanitizeLabel(userAgent.split(/[\s/]/)[0] ?? "");
  return productToken || DEFAULT_CLIENT_LABEL;
}
