const REDACTED_PATH_SEGMENT = ":redacted";
const MAX_PUBLIC_PATH_SEGMENT_LENGTH = 128;
const SENSITIVE_PATH_PARENTS = new Set([
  "account",
  "accounts",
  "auth",
  "checkout",
  "customer",
  "customers",
  "email",
  "emails",
  "invite",
  "invites",
  "order",
  "orders",
  "password",
  "payment",
  "payments",
  "profile",
  "reset",
  "session",
  "sessions",
  "token",
  "tokens",
  "user",
  "users",
  "vehicle",
  "vehicles",
  "verification",
  "verify",
]);
const EMAIL_IN_SEGMENT = /[^\s/@]+@[^\s/@]+\.[^\s/@]+/i;
const UUID_IN_SEGMENT =
  /(?:^|[^0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=$|[^0-9a-f])/i;
const JWT_SEGMENT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const LONG_NUMBER_SEGMENT = /^\d{7,18}$/;
const TAX_ID_IN_SEGMENT = /(?:^|\D)\d{2}[-.]?\d{8}[-.]?\d(?=$|\D)/;
const VEHICLE_REGISTRATION_SEGMENT =
  /^(?:[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})$/i;
const LONG_HEX_SEGMENT = /^[0-9a-f]{24,}$/i;
const OPAQUE_TOKEN_SEGMENT =
  /^(?=.{24,}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9_-]+={0,2}$/;

function decodedPathSegment(segment: string): string {
  let decoded = segment;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function isSensitivePathSegment(segment: string, parent: string): boolean {
  const decoded = decodedPathSegment(segment);
  const decodedParent = decodedPathSegment(parent).toLowerCase();
  if (SENSITIVE_PATH_PARENTS.has(decodedParent)) return true;
  if (decoded.length > MAX_PUBLIC_PATH_SEGMENT_LENGTH) return true;
  return (
    EMAIL_IN_SEGMENT.test(decoded) ||
    UUID_IN_SEGMENT.test(decoded) ||
    JWT_SEGMENT.test(decoded) ||
    LONG_NUMBER_SEGMENT.test(decoded) ||
    TAX_ID_IN_SEGMENT.test(decoded) ||
    VEHICLE_REGISTRATION_SEGMENT.test(decoded) ||
    LONG_HEX_SEGMENT.test(decoded) ||
    OPAQUE_TOKEN_SEGMENT.test(decoded)
  );
}

function stripControlCharacters(segment: string): string {
  let safe = "";
  for (const character of segment) {
    const code = character.charCodeAt(0);
    if (code > 31 && code !== 127) safe += character;
  }
  return safe;
}

/**
 * Keep useful route shape while ensuring attacker-controlled identifiers do
 * not enter MCP output, model transcripts, or downstream telemetry.
 */
export function privacySafePath(raw: string | undefined): string {
  const value = (raw?.trim() || "/").split(/[?#]/, 1)[0] || "/";
  const path = value.startsWith("/") ? value : `/${value}`;
  const segments = path.split("/");
  return segments
    .map((segment, index) => {
      if (!segment) return segment;
      const parent = segments[index - 1] ?? "";
      return isSensitivePathSegment(segment, parent)
        ? REDACTED_PATH_SEGMENT
        : stripControlCharacters(segment);
    })
    .join("/");
}
