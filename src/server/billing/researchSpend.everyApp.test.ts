import { afterEach, describe, expect, it, vi } from "vitest";

const { workerEnv, trackSpend, remaining } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, string>,
  trackSpend: vi.fn(),
  remaining: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
}));
vi.mock("./subscription", () => ({
  getUsageCreditsRemaining: remaining,
  trackUsageCreditSpend: trackSpend,
}));

import { billResearchSpend } from "./researchSpend";

const customer = {
  organizationId: "org_acme",
  projectId: "project_1",
  userId: "user_ana",
  userEmail: "ana@example.com",
};
const spend = [
  {
    provider: "dataforseo" as const,
    creditFeature: "keyword_research" as const,
    operation: "project_website_research",
    costUsd: 0.002,
  },
  {
    provider: "openrouter" as const,
    creditFeature: "agent" as const,
    operation: "project_website_research",
    costUsd: 0.01,
  },
];

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
});

describe("billResearchSpend off app.openseo.so", () => {
  it("records each organization's research cost behind an Every App gateway, without Autumn", async () => {
    workerEnv.AUTH_MODE = "everyapp";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await billResearchSpend(customer, spend);

    expect(log).toHaveBeenCalledWith(
      "[research-spend]",
      expect.objectContaining({
        organizationId: "org_acme",
        projectId: "project_1",
        totalUsd: 0.012,
        spend,
      }),
    );
    expect(remaining).not.toHaveBeenCalled();
    expect(trackSpend).not.toHaveBeenCalled();
  });

  it("stays silent on a self-hosted deployment", async () => {
    workerEnv.AUTH_MODE = "cloudflare_access";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await billResearchSpend(customer, spend);

    expect(log).not.toHaveBeenCalled();
    expect(trackSpend).not.toHaveBeenCalled();
  });
});
