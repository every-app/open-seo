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
  isEveryAppServerAuthMode: async () => workerEnv.AUTH_MODE === "everyapp",
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
});

describe("whoami behind an Every App gateway", () => {
  it("names the mode and reads no billing", async () => {
    workerEnv.AUTH_MODE = "everyapp";
    const result = await whoamiTool.handler({}, makeToolContext());

    expect(textContent(result)).toContain("Mode: Every App");
    expect(result.structuredContent).toMatchObject({
      mode: "every-app",
      creditsRemaining: null,
    });
    expect(getOrCreate).not.toHaveBeenCalled();
  });

  it("stays self-hosted for the other modes", async () => {
    workerEnv.AUTH_MODE = "cloudflare_access";
    const result = await whoamiTool.handler({}, makeToolContext());

    expect(textContent(result)).toContain("Mode: self-hosted");
    expect(result.structuredContent.mode).toBe("self-hosted");
  });
});
