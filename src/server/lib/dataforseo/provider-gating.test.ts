import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchBacklinksSummary: vi.fn(),
  isHostedServerAuthMode: vi.fn(async () => false),
}));

vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));

vi.mock("@/server/billing/subscription", () => ({
  assertUsageCreditsAvailable: vi.fn(),
  getOrCreateOrganizationCustomer: vi.fn(),
  trackUsageCreditSpend: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo/sections", () => ({
  fetchBacklinksSummary: mocks.fetchBacklinksSummary,
}));

vi.mock("@/server/lib/runtime-env", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isHostedServerAuthMode: mocks.isHostedServerAuthMode,
  };
});

import { createDataforseoClient } from "@/server/lib/dataforseo/client";

describe("DataForSEO provider gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("blocks client calls before any paid request is attempted when the provider is not configured", async () => {
    mocks.fetchBacklinksSummary.mockResolvedValue({
      data: { rank: 42 },
      billing: { costUsd: 0.05, path: ["backlinks", "summary"] },
    });

    const client = createDataforseoClient({
      organizationId: "org_123",
      userId: "user_123",
      userEmail: "alice@example.com",
    });

    await expect(
      client.backlinks.summary({ target: "example.com" }),
    ).rejects.toMatchObject({
      code: "PROVIDER_NOT_CONFIGURED",
      details: {
        provider: "dataforseo",
      },
    });

    expect(mocks.fetchBacklinksSummary).not.toHaveBeenCalled();
  });
});
