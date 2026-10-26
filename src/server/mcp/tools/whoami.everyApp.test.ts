import { afterEach, describe, expect, it, vi } from "vitest";
import { whoamiTool } from "./whoami";
import { makeToolContext, textContent } from "./tool-test-support";

const { workerEnv, getOrCreate } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, string>,
  getOrCreate: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("@/server/billing/autumn", () => ({
  autumn: { check: vi.fn(), customers: { getOrCreate } },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
});

describe("whoami behind an Every App gateway", () => {
  it("names the first-party tier and reads no billing", async () => {
    workerEnv.AUTH_MODE = "everyapp";
    const result = await whoamiTool.handler({}, makeToolContext());

    expect(textContent(result)).toContain("Mode: Every App (first party)");
    expect(result.structuredContent).toMatchObject({
      mode: "every-app",
      deploymentTier: "first_party",
      creditsRemaining: null,
    });
    expect(getOrCreate).not.toHaveBeenCalled();
  });

  it("names a fork", async () => {
    Object.assign(workerEnv, {
      AUTH_MODE: "everyapp",
      EVERY_APP_ORG_ID: "org_1",
    });
    const result = await whoamiTool.handler({}, makeToolContext());

    expect(textContent(result)).toContain("Mode: Every App (fork)");
    expect(result.structuredContent).toMatchObject({
      mode: "every-app",
      deploymentTier: "fork",
    });
  });

  it("stays self-hosted for the other modes", async () => {
    workerEnv.AUTH_MODE = "cloudflare_access";
    const result = await whoamiTool.handler({}, makeToolContext());

    expect(textContent(result)).toContain("Mode: self-hosted");
    expect(result.structuredContent).not.toHaveProperty("deploymentTier");
    expect(result.structuredContent.mode).toBe("self-hosted");
  });
});
