import {
  ANALYTICS_CONSENT_NOTICE,
  CONSENT_EVIDENCE_RETENTION_SECONDS,
  CONSENT_SCHEMA_VERSION,
} from "./consent";

const MAX_REQUEST_BYTES = 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConsentAction = "grant" | "withdraw";

interface ConsentRequestBody {
  action: ConsentAction;
  receiptId: string;
  requestId: string;
  noticeVersion: string;
  privacyPolicyVersion: string;
  measurementId: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isConsentRequestBody(value: unknown): value is ConsentRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    "action" in value &&
    (value.action === "grant" || value.action === "withdraw") &&
    "receiptId" in value &&
    typeof value.receiptId === "string" &&
    UUID_PATTERN.test(value.receiptId) &&
    "requestId" in value &&
    typeof value.requestId === "string" &&
    UUID_PATTERN.test(value.requestId) &&
    "noticeVersion" in value &&
    typeof value.noticeVersion === "string" &&
    "privacyPolicyVersion" in value &&
    typeof value.privacyPolicyVersion === "string" &&
    "measurementId" in value &&
    typeof value.measurementId === "string" &&
    /^G-[A-Z0-9]+$/.test(value.measurementId)
  );
}

async function readLimitedRequestBody(
  request: Request,
): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const result: unknown = await reader.read();
      if (
        !result ||
        typeof result !== "object" ||
        !("done" in result) ||
        typeof result.done !== "boolean"
      ) {
        return null;
      }
      if (result.done) break;
      if (!("value" in result) || !(result.value instanceof Uint8Array)) {
        return null;
      }
      bytesRead += result.value.byteLength;
      if (bytesRead > MAX_REQUEST_BYTES) {
        await reader.cancel("Request body is too large");
        return null;
      }
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function requestOrigin(request: Request, url: URL): string {
  const host = request.headers.get("host") ?? url.host;
  return `${url.protocol}//${host}`;
}

export async function recordAnalyticsConsent(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: {
        allow: "POST",
        "cache-control": "no-store",
      },
    });
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    origin !== requestOrigin(request, url) ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse({ error: "Expected application/json" }, 415);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return jsonResponse({ error: "Invalid Content-Length" }, 400);
    }
    if (Number(contentLength) > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: "Request body is too large" }, 413);
    }
  }

  // Rate-limit before reading any body bytes. The IP is used only by
  // Cloudflare's short-lived counter and is never written to the consent log.
  const rateLimitKey = request.headers.get("cf-connecting-ip") ?? "unknown";
  const rateLimit = await env.CONSENT_RATE_LIMITER.limit({ key: rateLimitKey });
  if (!rateLimit.success) {
    return jsonResponse({ error: "Too many consent requests" }, 429);
  }

  const rawBody = await readLimitedRequestBody(request);
  if (rawBody === null)
    return jsonResponse({ error: "Request body is too large" }, 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!isConsentRequestBody(parsed)) {
    return jsonResponse({ error: "Invalid consent record" }, 400);
  }

  // A page can remain open across a deployment. Never attest that it showed
  // the new notice when its browser script actually rendered an older one.
  if (
    parsed.action === "grant" &&
    (parsed.noticeVersion !== ANALYTICS_CONSENT_NOTICE.noticeVersion ||
      parsed.privacyPolicyVersion !==
        ANALYTICS_CONSENT_NOTICE.privacyPolicyVersion ||
      parsed.measurementId !== env.GA4_MEASUREMENT_ID)
  ) {
    return jsonResponse(
      { error: "Consent notice changed", code: "consent_version_mismatch" },
      409,
    );
  }

  const recordedAt = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const record = {
    schemaVersion: CONSENT_SCHEMA_VERSION,
    eventId,
    requestId: parsed.requestId,
    receiptId: parsed.receiptId,
    action: parsed.action,
    analyticsGranted: parsed.action === "grant",
    recordedAt,
    measurementId: parsed.measurementId,
    ...(parsed.action === "grant"
      ? { notice: ANALYTICS_CONSENT_NOTICE }
      : {
          noticeReference: {
            noticeVersion: parsed.noticeVersion,
            privacyPolicyVersion: parsed.privacyPolicyVersion,
            measurementId: parsed.measurementId,
          },
        }),
  };

  // Every attempt receives a new server event id and therefore a unique key.
  // A retried browser request may produce a clearly marked duplicate with the
  // same requestId, but it can never overwrite an earlier grant or withdrawal.
  const key = [
    "analytics-consent",
    `v${CONSENT_SCHEMA_VERSION}`,
    parsed.receiptId,
    `${recordedAt}-${eventId}`,
  ].join("/");

  try {
    await env.CONSENT_LOG.put(key, JSON.stringify(record), {
      expirationTtl: CONSENT_EVIDENCE_RETENTION_SECONDS,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "analytics_consent_write_failed",
        action: parsed.action,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return jsonResponse(
      { error: "Analytics consent could not be recorded" },
      503,
    );
  }

  return jsonResponse(
    {
      receiptId: parsed.receiptId,
      action: parsed.action,
      recordedAt,
    },
    201,
  );
}
