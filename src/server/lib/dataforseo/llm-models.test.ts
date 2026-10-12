import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  isKnownLlmModelName,
  resolveLatestLlmModelName,
} from "@/server/lib/dataforseo/llm-models";

function stubCatalog(names: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: ["v3"],
            cost: 0,
            result: names.map((model_name) => ({ model_name })),
          },
        ],
      }),
    ),
  );
}

// The catalog is cached per slug for an hour at module level. Moving the clock
// two hours per test makes every test read its own stubbed catalog.
let clock = Date.UTC(2026, 0, 1);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock += 2 * 60 * 60 * 1000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("resolveLatestLlmModelName", () => {
  it("honors the ChatGPT pin while the catalog lists it", async () => {
    stubCatalog(["gpt-5.6-luna", "gpt-5.5", "gpt-5"]);
    await expect(resolveLatestLlmModelName("chat_gpt")).resolves.toBe(
      "gpt-5.6-luna",
    );
  });

  it("picks the highest plain flagship alias when the pin is gone", async () => {
    stubCatalog([
      "o4-mini",
      "gpt-5.6-terra",
      "gpt-5.5",
      "gpt-5.5-2026-04-23",
      "gpt-5-mini",
      "gpt-5",
    ]);
    await expect(resolveLatestLlmModelName("chat_gpt")).resolves.toBe(
      "gpt-5.5",
    );

    stubCatalog([
      "claude-opus-5",
      "claude-sonnet-4-6",
      "claude-sonnet-5",
      "claude-sonnet-4-5-20250929",
    ]);
    await expect(resolveLatestLlmModelName("claude")).resolves.toBe(
      "claude-sonnet-5",
    );
  });

  it("falls back to a listed snapshot name when no flagship alias is listed", async () => {
    stubCatalog(["sonar-pro", "sonar"]);
    await expect(resolveLatestLlmModelName("perplexity")).resolves.toBe(
      "sonar-pro",
    );
  });

  it("uses the static snapshot when the catalog endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("upstream down")),
    );

    await expect(resolveLatestLlmModelName("claude")).resolves.toBe(
      "claude-sonnet-5",
    );
    await expect(
      isKnownLlmModelName("claude", "claude-sonnet-4-0"),
    ).resolves.toBe(false);
  });
});
