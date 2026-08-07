import { isCrawlableUrl } from "@/server/lib/audit/url-policy";

export const INDEXNOW_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;
export const INDEXNOW_WEBHOOK_MAX_URLS = 2_000;
export const INDEXNOW_WEBHOOK_MAX_URLS_PER_PROJECT = 500;
export const INDEXNOW_WEBHOOK_MAX_PROJECTS = 100;
export const INDEXNOW_WEBHOOK_DEDUPE_WINDOW_MS = 5 * 60 * 1_000;

const MAX_URL_LENGTH = 2_048;

export type ParsedPayload = {
  urls: string[];
  hasUrls: boolean;
};

export type WebhookEvent = {
  url: string;
  eventType: string;
  status: string;
  createdAt: string;
};

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function configuredHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  const host = parsed.host.toLowerCase().replace(/\.$/, "");
  if (!host || !isCrawlableUrl(`${parsed.protocol}//${parsed.host}/`)) {
    return null;
  }

  return host;
}

export function parseAllowedHosts(
  raw: string | readonly string[] | undefined,
): { hosts: Set<string>; invalid: boolean } {
  const values =
    typeof raw === "string"
      ? raw.split(",")
      : raw === undefined
        ? []
        : Array.from(raw);
  const hosts = new Set<string>();
  let invalid = false;

  for (const value of values) {
    const host = configuredHost(value);
    if (!host) {
      if (value.trim()) invalid = true;
      continue;
    }
    hosts.add(host);
  }

  return { hosts, invalid };
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (
    parsed.username ||
    parsed.password ||
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !isCrawlableUrl(parsed.toString())
  ) {
    return null;
  }

  parsed.hash = "";
  return parsed.toString();
}

function hostForUrl(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function uniqueUrlsForHost(urls: string[], host: string): string[] {
  const unique = new Set<string>();
  for (const rawUrl of urls) {
    const url = normalizeUrl(rawUrl);
    if (!url || hostForUrl(url) !== host) continue;
    unique.add(url);
  }
  return Array.from(unique);
}

function readPayloadUrls(payload: unknown): string[] | null {
  if (!isRecord(payload)) return null;

  const values: unknown[] = [];
  for (const key of ["urls", "changedUrls"]) {
    const value = payload[key];
    if (value === undefined) continue;
    if (!isUnknownArray(value)) return null;
    for (const entry of value) values.push(entry);
  }

  if (values.length === 0 && payload.url !== undefined) {
    values.push(payload.url);
  }

  if (values.length > INDEXNOW_WEBHOOK_MAX_URLS) return null;
  const urls: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") return null;
    const normalized = normalizeUrl(value);
    if (!normalized) return null;
    urls.push(normalized);
  }

  return urls;
}

export async function parsePayload(
  request: Request,
): Promise<
  { ok: true; payload: ParsedPayload } | { ok: false; response: Response }
> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number.parseInt(contentLength, 10) > INDEXNOW_WEBHOOK_MAX_BODY_BYTES
  ) {
    return {
      ok: false,
      response: jsonResponse({ error: "Webhook payload is too large." }, 413),
    };
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: "Unable to read webhook payload." }, 400),
    };
  }

  if (body.byteLength > INDEXNOW_WEBHOOK_MAX_BODY_BYTES) {
    return {
      ok: false,
      response: jsonResponse({ error: "Webhook payload is too large." }, 413),
    };
  }

  if (body.byteLength === 0) {
    return { ok: true, payload: { urls: [], hasUrls: false } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Webhook payload must be valid JSON." },
        400,
      ),
    };
  }

  const urls = readPayloadUrls(parsed);
  if (urls === null) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Webhook payload contains invalid URL data." },
        400,
      ),
    };
  }

  return { ok: true, payload: { urls, hasUrls: urls.length > 0 } };
}

async function sameSecret(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  if (leftBytes.length !== rightBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function isAuthorized(
  request: Request,
  secret: string,
): Promise<boolean> {
  const presented = new Set<string>();
  const headerSecret = request.headers.get("x-indexnow-webhook-secret");
  if (headerSecret) presented.add(headerSecret);

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    presented.add(authorization.slice("Bearer ".length));
  }

  for (const value of presented) {
    if (await sameSecret(secret, value)) return true;
  }
  return false;
}

function parseEventTime(value: string): number | null {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function recentUrls(events: WebhookEvent[], now: number): Set<string> {
  const cutoff = now - INDEXNOW_WEBHOOK_DEDUPE_WINDOW_MS;
  const urls = new Set<string>();
  for (const event of events) {
    if (event.eventType !== "submitted" || event.status !== "success") {
      continue;
    }
    const timestamp = parseEventTime(event.createdAt);
    if (timestamp === null || timestamp < cutoff || timestamp > now) continue;
    const url = normalizeUrl(event.url);
    if (url) urls.add(url);
  }
  return urls;
}
