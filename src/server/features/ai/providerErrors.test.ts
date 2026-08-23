import { describe, expect, it } from "vitest";
import {
  normalizeProviderError,
  OPENROUTER_PRIVACY_URL,
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
    expect(
      normalizeProviderError(new TypeError("fetch failed")).code,
    ).toBe("PROVIDER_UNAVAILABLE");
  });

  it("maps invalid/unreachable base URLs to INVALID_BASE_URL", () => {
    expect(normalizeProviderError(new TypeError("Failed to parse URL"))).toMatchObject({
      code: "INVALID_BASE_URL",
      retryable: false,
    });
    expect(
      normalizeProviderError(new Error("fetch failed: ECONNREFUSED 127.0.0.1:11434")),
    ).toMatchObject({ code: "INVALID_BASE_URL" });
  });

  it("never leaks raw provider payloads or secrets into messages", () => {
    const error = retryError({
      name: "AI_APICallError",
      statusCode: 401,
      message: 'Unauthorized: key sk-or-v1-secret-value was rejected',
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
