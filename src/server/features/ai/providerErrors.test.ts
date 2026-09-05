import { describe, expect, it } from "vitest";
import {
  normalizeProviderError,
  OPENROUTER_PRIVACY_URL,
  parseRetryAfterSeconds,
} from "./providerErrors";

/** Mimic the AI SDK's retry wrapper: errors[].last carries the real failure. */
function retryError(last: {
  message?: unknown;
  statusCode?: number;
  name?: string;
}): Error {
  const detail =
    typeof last.message === "string" ? last.message : "provider error";
  const error = new Error(`Failed after 3 attempts. Last error: ${detail}`);
  error.name = "AI_RetryError";
  Object.assign(error, { errors: [{}, {}, last] });
  return error;
}

function apiCallError(
  statusCode: number,
  message: string,
): Record<string, unknown> {
  // Deliberately a plain object: normalizeProviderError duck-types errors
  // instead of relying on instanceof across duplicated SDK copies.
  return { name: "AI_APICallError", message, statusCode };
}

describe("normalizeProviderError", () => {
  it("maps the OpenRouter ZDR data-policy refusal (wrapped in retries) to DATA_POLICY_BLOCKED", () => {
    // Exact vendor wording from a live failure, wrapped exactly like the
    // AI SDK wraps exhausted retries.
    const error = retryError({
      name: "AI_APICallError",
      statusCode: 404,
      message:
        "No endpoints found matching your data policy (Zero data retention).",
    });
    const result = normalizeProviderError(error, "openrouter", "gpt-5");
    expect(result.code).toBe("DATA_POLICY_BLOCKED");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("Zero Data Retention");
    expect(result.message).toContain("privacy");
  });

  it("detects policy refusals even when they arrive as plain strings", () => {
    const result = normalizeProviderError(
      "No endpoints found matching your data policy (Zero data retention).",
      "openrouter",
    );
    expect(result.code).toBe("DATA_POLICY_BLOCKED");
  });

  it("classifies auth failures from status codes", () => {
    const result = normalizeProviderError(
      apiCallError(401, "User not found."),
      "openrouter",
    );
    expect(result.code).toBe("AUTH_ERROR");
    expect(result.retryable).toBe(false);
  });

  it("classifies bare 404s as MODEL_UNAVAILABLE without policy wording", () => {
    const result = normalizeProviderError(
      apiCallError(404, "No endpoints found for some/model."),
      "openrouter",
      "some/model",
    );
    expect(result.code).toBe("MODEL_UNAVAILABLE");
    expect(result.message).toContain("some/model");
  });

  it("classifies rate limits as retryable", () => {
    const result = normalizeProviderError(
      apiCallError(429, "Rate limit exceeded"),
      "openai",
    );
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.retryable).toBe(true);
  });

  it("classifies server errors and connection drops as transient", () => {
    expect(normalizeProviderError(apiCallError(502, "Bad gateway")).code).toBe(
      "PROVIDER_UNAVAILABLE",
    );
    expect(normalizeProviderError(new Error("socket hang up")).code).toBe(
      "PROVIDER_UNAVAILABLE",
    );
    expect(normalizeProviderError(new TypeError("fetch failed")).code).toBe(
      "PROVIDER_UNAVAILABLE",
    );
  });

  it("maps invalid/unreachable base URLs to INVALID_BASE_URL", () => {
    expect(
      normalizeProviderError(new TypeError("Failed to parse URL")),
    ).toMatchObject({
      code: "INVALID_BASE_URL",
      retryable: false,
    });
    expect(
      normalizeProviderError(
        new Error("fetch failed: ECONNREFUSED 127.0.0.1:11434"),
      ),
    ).toMatchObject({ code: "INVALID_BASE_URL" });
  });

  it("never leaks raw provider payloads or secrets into messages", () => {
    const error = retryError({
      name: "AI_APICallError",
      statusCode: 401,
      message: "Unauthorized: key sk-or-v1-secret-value was rejected",
    });
    const result = normalizeProviderError(error, "openrouter");
    expect(result.message).not.toMatch(/sk-|authorization|Bearer/i);
  });

  it("falls back to UNKNOWN for unrecognized shapes", () => {
    expect(normalizeProviderError({ weird: true })).toMatchObject({
      code: "UNKNOWN",
    });
  });

  it("exposes the OpenRouter privacy settings URL for policy errors", () => {
    expect(OPENROUTER_PRIVACY_URL).toContain("openrouter.ai/settings/privacy");
  });
});

describe("normalizeProviderError — OpenRouter 402 in-flight credit guard", () => {
  // The exact payload from the 2026-09-01 incident: HTTP 402,
  // reason=in_flight_budget_exhausted, Retry-After 120, vendor remedy URL,
  // OpenRouter user_id. None of that may survive normalization.
  const OPENROUTER_402_MESSAGE =
    "This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.";

  function openRouter402Payload(): Record<string, unknown> {
    return {
      name: "AI_APICallError",
      message: OPENROUTER_402_MESSAGE,
      statusCode: 402,
      responseBody: JSON.stringify({
        error: {
          message: OPENROUTER_402_MESSAGE,
          code: 402,
          metadata: {
            reason: "in_flight_budget_exhausted",
            limit_source: "openrouter_in_flight_budget",
            remedy_hint:
              "Retry after your in-flight requests settle (see the Retry-After header). Adding credits at https://openrouter.ai/settings/credits raises your in-flight budget.",
            headers: { "Retry-After": "120" },
          },
        },
        user_id: "user_3Ba3GDxUoWnX92HVjC1LMaWRGVR",
      }),
      responseHeaders: { "retry-after": "120" },
      isRetryable: false,
    };
  }

  it("classifies the exact live 402 payload as PROVIDER_INSUFFICIENT_CREDITS", () => {
    const result = normalizeProviderError(
      openRouter402Payload(),
      "openrouter",
      "deepseek/deepseek-v4-flash-0731",
    );
    expect(result.code).toBe("PROVIDER_INSUFFICIENT_CREDITS");
    expect(result.message).toBe(
      "Your AI provider has insufficient available credits for this request. " +
        "Wait for in-flight requests to settle or add credits, then try again.",
    );
  });

  it("never leaks user ids, headers, raw JSON, or remedy URLs from the 402 payload", () => {
    const result = normalizeProviderError(openRouter402Payload(), "openrouter");
    expect(result.message).not.toMatch(/user_/i);
    expect(result.message).not.toMatch(/cf-ray/i);
    expect(result.message).not.toMatch(/in_flight_budget_exhausted/);
    expect(result.message).not.toMatch(/responseBody|statusCode/i);
    expect(result.message).not.toMatch(/https?:\/\//);
    expect(result.message).not.toContain("3Ba3GDxUoWnX92HVjC1LMaWRGVR");
  });

  it("is NOT retryable — an immediate retry re-hits the same credit guard", () => {
    const result = normalizeProviderError(openRouter402Payload(), "openrouter");
    expect(result.retryable).toBe(false);
  });

  it("extracts Retry-After from the vendor payload (capped at 600)", () => {
    const withRetryAfter = openRouter402Payload();
    const result = normalizeProviderError(withRetryAfter, "openrouter");
    expect(result.retryAfterSeconds).toBe(120);

    const hostile = openRouter402Payload();
    hostile.responseHeaders = { "retry-after": "999999" };
    expect(
      normalizeProviderError(hostile, "openrouter").retryAfterSeconds,
    ).toBe(600);
  });

  it("classifies the 402 wording wrapped in the AI SDK retry envelope", () => {
    const error = retryError({
      name: "AI_APICallError",
      statusCode: 402,
      message: OPENROUTER_402_MESSAGE,
    });
    const result = normalizeProviderError(error, "openrouter");
    expect(result.code).toBe("PROVIDER_INSUFFICIENT_CREDITS");
    expect(result.retryable).toBe(false);
  });

  it("classifies the 402 wording arriving as a plain in-stream string", () => {
    const result = normalizeProviderError(OPENROUTER_402_MESSAGE, "openrouter");
    expect(result.code).toBe("PROVIDER_INSUFFICIENT_CREDITS");
  });

  it("classifies a bare 402 status without the distinctive wording", () => {
    const result = normalizeProviderError(
      apiCallError(402, "Payment required"),
      "openrouter",
    );
    expect(result.code).toBe("PROVIDER_INSUFFICIENT_CREDITS");
    expect(result.retryable).toBe(false);
  });
});

describe("parseRetryAfterSeconds", () => {
  it("parses numeric strings and numbers", () => {
    expect(parseRetryAfterSeconds("120")).toBe(120);
    expect(parseRetryAfterSeconds(30)).toBe(30);
    expect(parseRetryAfterSeconds(" 45 ")).toBe(45);
  });

  it("ceilings fractional values", () => {
    expect(parseRetryAfterSeconds("1.5")).toBe(2);
  });

  it("rejects absent, non-numeric, negative, and HTTP-date values", () => {
    expect(parseRetryAfterSeconds(undefined)).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("")).toBeNull();
    expect(parseRetryAfterSeconds("soon")).toBeNull();
    expect(parseRetryAfterSeconds(-5)).toBeNull();
    expect(parseRetryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
  });

  it("caps absurd values at the sane maximum", () => {
    expect(parseRetryAfterSeconds(1e9)).toBe(600);
    expect(parseRetryAfterSeconds("999999")).toBe(600);
  });

  it("reads Retry-After from nested responseHeaders on retryable codes", () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 429,
      message: "Rate limit exceeded",
      responseHeaders: { "Retry-After": "37" },
    };
    const result = normalizeProviderError(error, "openrouter");
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.retryable).toBe(true);
    expect(result.retryAfterSeconds).toBe(37);
  });
});
