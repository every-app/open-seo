import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SelfHostTelemetryDependencies } from "./self-host-telemetry";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: {} }));

type StoredState = {
  installId: string;
  lastHeartbeatAt: Date | null;
  lastVersion: string | null;
  mcpToolCallCount: number;
};

const NOW = new Date("2026-07-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const emptyCounts = {
  userCount: 0,
  projectCount: 0,
  siteAuditCount: 0,
  rankTrackingKeywordCount: 0,
  savedKeywordCount: 0,
  gscConnected: false,
  samChatUsed: false,
};

function createHarness(
  initialState?: Partial<StoredState>,
  appVersion = "1.0.0",
) {
  const state: StoredState = {
    installId: "install-1",
    lastHeartbeatAt: null,
    lastVersion: null,
    mcpToolCallCount: 0,
    ...initialState,
  };
  const sendHeartbeat = vi.fn<SelfHostTelemetryDependencies["sendHeartbeat"]>();
  const claimHeartbeat = vi.fn(async (now: Date) => {
    if (
      state.lastHeartbeatAt &&
      now.getTime() - state.lastHeartbeatAt.getTime() <= DAY_MS
    ) {
      return null;
    }

    const previous = { ...state };
    state.lastHeartbeatAt = now;
    return previous;
  });
  const markHeartbeatSent = vi.fn(async (currentVersion: string) => {
    state.lastVersion = currentVersion;
    state.mcpToolCallCount = 0;
  });
  const dependencies: Partial<SelfHostTelemetryDependencies> = {
    now: () => NOW,
    isNonProductionBuild: () => false,
    claimHeartbeat,
    collectCounts: async () => emptyCounts,
    sendHeartbeat,
    markHeartbeatSent,
    getDbBackend: () => "d1",
    version: appVersion,
  };

  return {
    state,
    dependencies,
    sendHeartbeat,
    claimHeartbeat,
    markHeartbeatSent,
  };
}

async function runHeartbeat(harness: ReturnType<typeof createHarness>) {
  const { maybeSendSelfHostHeartbeat } = await import("./self-host-telemetry");
  await maybeSendSelfHostHeartbeat({
    dependencies: harness.dependencies,
    skipMemoryThrottle: true,
  });
}

describe("maybeSendSelfHostHeartbeat", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("AUTH_MODE", "cloudflare_access");
    vi.stubEnv("OPENSEO_TELEMETRY_DISABLED", "");
    vi.stubEnv("DO_NOT_TRACK", "");
  });

  it("does not send in hosted mode", async () => {
    vi.stubEnv("AUTH_MODE", "hosted");
    const harness = createHarness();

    await runHeartbeat(harness);

    expect(harness.claimHeartbeat).not.toHaveBeenCalled();
    expect(harness.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("does not send when OPENSEO_TELEMETRY_DISABLED is set", async () => {
    vi.stubEnv("OPENSEO_TELEMETRY_DISABLED", "1");
    const harness = createHarness();

    await runHeartbeat(harness);

    expect(harness.claimHeartbeat).not.toHaveBeenCalled();
    expect(harness.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("does not send when DO_NOT_TRACK is set", async () => {
    vi.stubEnv("DO_NOT_TRACK", "1");
    const harness = createHarness();

    await runHeartbeat(harness);

    expect(harness.claimHeartbeat).not.toHaveBeenCalled();
    expect(harness.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("does not send from non-production builds (dev, test, preview)", async () => {
    const harness = createHarness();
    // Omit the isNonProductionBuild override: the production gate reads
    // import.meta.env.MODE, which is "test" under vitest and must block.
    delete harness.dependencies.isNonProductionBuild;

    await runHeartbeat(harness);

    expect(harness.claimHeartbeat).not.toHaveBeenCalled();
    expect(harness.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("allows only one concurrent caller to claim a heartbeat", async () => {
    const harness = createHarness();

    await Promise.all([runHeartbeat(harness), runHeartbeat(harness)]);

    expect(harness.claimHeartbeat).toHaveBeenCalledTimes(2);
    expect(harness.sendHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("does not send within 24 hours", async () => {
    const harness = createHarness({
      lastHeartbeatAt: new Date(NOW.getTime() - DAY_MS + 1),
    });

    await runHeartbeat(harness);

    expect(harness.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("sends after 24 hours", async () => {
    const harness = createHarness({
      lastHeartbeatAt: new Date(NOW.getTime() - DAY_MS - 1),
    });

    await runHeartbeat(harness);

    expect(harness.sendHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("marks the first heartbeat and resets the reported MCP counter", async () => {
    const harness = createHarness({ mcpToolCallCount: 7 });

    await runHeartbeat(harness);

    expect(harness.sendHeartbeat.mock.calls[0]?.[1]).toMatchObject({
      firstRun: true,
      mcpToolCalls: 7,
    });
    expect(harness.state.mcpToolCallCount).toBe(0);
    expect(harness.markHeartbeatSent).toHaveBeenCalledTimes(1);
  });

  it("includes prevVersion only when the version changes", async () => {
    const changed = createHarness(
      {
        lastHeartbeatAt: new Date(NOW.getTime() - DAY_MS - 1),
        lastVersion: "0.9.0",
      },
      "1.0.0",
    );
    await runHeartbeat(changed);
    expect(changed.sendHeartbeat.mock.calls[0]?.[1]).toMatchObject({
      version: "1.0.0",
      prevVersion: "0.9.0",
      firstRun: false,
    });

    const unchanged = createHarness(
      {
        lastHeartbeatAt: new Date(NOW.getTime() - DAY_MS - 1),
        lastVersion: "1.0.0",
      },
      "1.0.0",
    );
    await runHeartbeat(unchanged);
    expect(unchanged.sendHeartbeat.mock.calls[0]?.[1]).not.toHaveProperty(
      "prevVersion",
    );
  });
});
