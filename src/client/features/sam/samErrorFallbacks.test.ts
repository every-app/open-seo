import { describe, expect, it } from "vitest";
import { safeSamErrorMessage, SAM_ERROR_FALLBACKS } from "./samErrorFallbacks";

const GENERIC = SAM_ERROR_FALLBACKS.UNKNOWN;
const CREDITS = SAM_ERROR_FALLBACKS.PROVIDER_INSUFFICIENT_CREDITS;

// The exact raw payload from the 2026-09-01 incident, reconstructed as the
// string the client would receive if every server-side seam failed.
const RAW_402 =
  "This request would exceed your available credits given your current in-flight requests. " +
  'Retry after in-flight requests settle, or add credits. {"error":{"message":"This request would exceed your available credits","code":402,' +
  '"metadata":{"reason":"in_flight_budget_exhausted","remedy_hint":"Adding credits at https://openrouter.ai/settings/credits raises your in-flight budget."},' +
  '"user_id":"user_3Ba3GDxUoWnX92HVjC1LMaWRGVR"}}';

describe("safeSamErrorMessage — curated messages pass through", () => {
  it("passes exact curated messages verbatim", () => {
    expect(safeSamErrorMessage(CREDITS)).toBe(CREDITS);
    expect(safeSamErrorMessage(GENERIC)).toBe(GENERIC);
    expect(safeSamErrorMessage(SAM_ERROR_FALLBACKS.RATE_LIMITED)).toBe(
      SAM_ERROR_FALLBACKS.RATE_LIMITED,
    );
  });

  it("passes curated messages with a provider-name prefix", () => {
    expect(
      safeSamErrorMessage(
        "OpenRouter rejected the API key. Check that the configured credential is valid.",
      ),
    ).toBe(
      "OpenRouter rejected the API key. Check that the configured credential is valid.",
    );
  });
});

describe("safeSamErrorMessage — the 402 credits incident", () => {
  it("maps the raw OpenRouter 402 payload to the curated credits message", () => {
    expect(safeSamErrorMessage(RAW_402)).toBe(CREDITS);
  });

  it("maps the bare vendor sentence (no JSON) — the short 'clean' form that would defeat a naive heuristic", () => {
    expect(
      safeSamErrorMessage(
        "This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.",
      ),
    ).toBe(CREDITS);
  });

  it("maps the vendor reason code alone", () => {
    expect(safeSamErrorMessage("in_flight_budget_exhausted")).toBe(CREDITS);
  });

  it("never renders the raw credits payload verbatim", () => {
    const mapped = safeSamErrorMessage(RAW_402);
    expect(mapped).not.toMatch(/user_/);
    expect(mapped).not.toMatch(/https?:\/\//);
    expect(mapped).not.toMatch(/in_flight_budget_exhausted/);
    expect(mapped).not.toMatch(/responseBody|statusCode/);
  });
});

describe("safeSamErrorMessage — known provider wording maps to curated messages", () => {
  it("maps vendor phrases to their curated equivalents", () => {
    expect(
      safeSamErrorMessage("No endpoints found matching your data policy"),
    ).toBe(SAM_ERROR_FALLBACKS.DATA_POLICY_BLOCKED);
    expect(safeSamErrorMessage("Rate limit exceeded, too many requests")).toBe(
      SAM_ERROR_FALLBACKS.RATE_LIMITED,
    );
    expect(safeSamErrorMessage("socket hang up")).toBe(
      SAM_ERROR_FALLBACKS.PROVIDER_UNAVAILABLE,
    );
    expect(safeSamErrorMessage("Request timed out after 60s")).toBe(
      SAM_ERROR_FALLBACKS.CONNECTION_TIMEOUT,
    );
    expect(safeSamErrorMessage("Unauthorized: invalid api key")).toBe(
      SAM_ERROR_FALLBACKS.AUTH_ERROR,
    );
  });
});

describe("safeSamErrorMessage — tool-input failures (Phase V)", () => {
  const TOOL_INPUT = SAM_ERROR_FALLBACKS.TOOL_INPUT_INVALID;

  it("passes the server-curated TOOL_INPUT_INVALID message through, preserving its safe schema diagnosis", () => {
    const curated =
      "Invalid tool arguments for get_serp_results: queries.0.keyword: Invalid input: expected string, received undefined. " +
      "The request was not executed and no provider call was made.";
    expect(safeSamErrorMessage(curated)).toBe(curated);
  });

  it("maps the raw AI SDK tool-input wording escaping to the client", () => {
    expect(
      safeSamErrorMessage(
        'Invalid input for tool get_serp_results: [{"code":"invalid_type","path":["queries",0,"keyword"],"message":"Invalid input: expected string, received undefined"}]',
      ),
    ).toBe(TOOL_INPUT);
    expect(
      safeSamErrorMessage(
        "Model tried to call unavailable tool 'get_serp_resultz'. Available tools: a, b.",
      ),
    ).toBe(TOOL_INPUT);
  });

  it("never renders provider blame for a schema-validation failure", () => {
    for (const raw of [
      "Invalid input for tool get_serp_results: …",
      "Invalid tool arguments for list_saved_keywords: limit: expected 50 | 100 | 250",
    ]) {
      const mapped = safeSamErrorMessage(raw);
      expect(mapped).not.toContain("ollama_cloud");
      expect(mapped).not.toContain("does not support");
    }
  });
});

describe("safeSamErrorMessage — unknown and hostile payloads degrade", () => {
  it("returns the generic message for unrecognized vendor dumps", () => {
    expect(
      safeSamErrorMessage(
        'APICallError: {"data":{"error":{"code":500,"message":"boom"}},"user_id":"u1"}',
      ),
    ).toBe(GENERIC);
  });

  it("strips payloads containing stack frames, headers, or secrets", () => {
    expect(
      safeSamErrorMessage(
        "TypeError: fetch failed at postToApi (openrouter.js:2310:14) at OpenRouterChatLanguageModel.doStream",
      ),
    ).toBe(GENERIC);
    expect(
      safeSamErrorMessage("Request failed with key sk-or-v1-abcdef1234567890"),
    ).toBe(GENERIC);
    expect(
      safeSamErrorMessage("cf-ray: a347f5ec0d09e175-MRS user_id: u1"),
    ).toBe(GENERIC);
  });

  it("allows short plain app-authored protocol messages through", () => {
    expect(safeSamErrorMessage("The assistant was interrupted.")).toBe(
      "The assistant was interrupted.",
    );
    expect(
      safeSamErrorMessage("chat stream stalled: inactivity watchdog fired"),
    ).toBe("chat stream stalled: inactivity watchdog fired");
  });

  it("degrades empty/whitespace input to the generic message", () => {
    expect(safeSamErrorMessage(null)).toBe(GENERIC);
    expect(safeSamErrorMessage("   ")).toBe(GENERIC);
    expect(safeSamErrorMessage(undefined)).toBe(GENERIC);
  });
});
