import { z } from "zod";

export const UMAMI_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/UMAMI_ANALYTICS.md";

const UMAMI_CLOUD_API_URL = "https://api.umami.is/v1";

export const umamiAuthTypeSchema = z.enum(["api_key", "password"]);
export type UmamiAuthType = z.infer<typeof umamiAuthTypeSchema>;

// OpenSEO sets these itself; letting a custom header override them would break
// authentication or the request framing.
const RESERVED_HEADER_NAMES = new Set([
  "authorization",
  "x-umami-api-key",
  "host",
  "content-type",
  "content-length",
  "transfer-encoding",
  "connection",
  "cookie",
]);

export const MAX_UMAMI_CUSTOM_HEADERS = 10;

// Values are replayed verbatim as HTTP headers, so anything outside printable
// ASCII (a CR/LF, a smart quote from a rich-text paste) is rejected here.
export const umamiHeaderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a header name")
    .max(100)
    .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, "Not a valid HTTP header name")
    .refine(
      (name) => !RESERVED_HEADER_NAMES.has(name.toLowerCase()),
      "OpenSEO sets this header itself",
    ),
  value: z
    .string()
    .trim()
    .min(1, "Enter a header value")
    .max(4096)
    .regex(/^[\x20-\x7e]+$/, "This value can't go in an HTTP header"),
});
export type UmamiHeader = z.infer<typeof umamiHeaderSchema>;

/**
 * The stored form of an instance URL: origin plus path prefix, no trailing
 * slash, no trailing `/api`. Umami Cloud (cloud.umami.is or api.umami.is)
 * always maps to its API URL. Returns null for anything that isn't http(s).
 */
export function normalizeUmamiBaseUrl(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.hostname === "cloud.umami.is" || url.hostname === "api.umami.is") {
    return UMAMI_CLOUD_API_URL;
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api$/i, "");
  return `${url.origin}${path}`;
}

/** Where the REST API lives: Umami Cloud serves it at the root of its API
 *  URL, a self-hosted server under `/api`. */
export function umamiApiRoot(baseUrl: string): string {
  return baseUrl === UMAMI_CLOUD_API_URL ? baseUrl : `${baseUrl}/api`;
}
