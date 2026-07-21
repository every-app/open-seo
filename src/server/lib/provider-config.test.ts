import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getDataforseoProviderStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("defaults to disabled with a zero budget and no secret", async () => {
    const { getDataforseoProviderStatus } = await import("./provider-config");

    await expect(getDataforseoProviderStatus()).resolves.toMatchObject({
      provider: "dataforseo",
      configured: false,
      enabled: false,
      hasApiKey: false,
      budgetUsd: 0,
      reason: "Provider not configured. DataForSEO is disabled by default.",
    });
  });

  it("stays disabled when the enable flag is missing even if a key and budget exist", async () => {
    vi.stubEnv("DATAFORSEO_API_KEY", "test-key");
    vi.stubEnv("OPENSEO_DATAFORSEO_BUDGET_USD", "25");

    const { getDataforseoProviderStatus } = await import("./provider-config");

    await expect(getDataforseoProviderStatus()).resolves.toMatchObject({
      configured: false,
      enabled: false,
      hasApiKey: true,
      budgetUsd: 25,
      reason: "Set OPENSEO_ENABLE_DATAFORSEO=1 to allow paid DataForSEO calls.",
    });
  });

  it("stays disabled when the budget is zero even if the key and flag exist", async () => {
    vi.stubEnv("DATAFORSEO_API_KEY", "test-key");
    vi.stubEnv("OPENSEO_ENABLE_DATAFORSEO", "1");
    vi.stubEnv("OPENSEO_DATAFORSEO_BUDGET_USD", "0");

    const { getDataforseoProviderStatus } = await import("./provider-config");

    await expect(getDataforseoProviderStatus()).resolves.toMatchObject({
      configured: false,
      enabled: false,
      hasApiKey: true,
      budgetUsd: 0,
      reason:
        "Set OPENSEO_DATAFORSEO_BUDGET_USD to a value greater than 0 to allow paid DataForSEO calls.",
    });
  });

  it("becomes configured only when key, enable flag, and positive budget are all present", async () => {
    vi.stubEnv("DATAFORSEO_API_KEY", "test-key");
    vi.stubEnv("OPENSEO_ENABLE_DATAFORSEO", "1");
    vi.stubEnv("OPENSEO_DATAFORSEO_BUDGET_USD", "12.5");

    const { getDataforseoProviderStatus } = await import("./provider-config");

    await expect(getDataforseoProviderStatus()).resolves.toMatchObject({
      provider: "dataforseo",
      configured: true,
      enabled: true,
      hasApiKey: true,
      budgetUsd: 12.5,
      reason: null,
    });
  });
});
