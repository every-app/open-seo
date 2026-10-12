import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelfHostTelemetryDependencies } from "./self-host-telemetry";
import {
  incrementSelfHostMcpToolCallCount,
  maybeSendSelfHostHeartbeat,
} from "./self-host-telemetry";

const dbMocks = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({ onConflictDoUpdate })),
  }));
  return { insert, onConflictDoUpdate };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { insert: dbMocks.insert } }));

type StoredState = {
  installId: string;
  installedAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastVersion: string | null;
  mcpToolCallCount: number;
};

const NOW = new Date("2026-07-18T12:00:00.000Z");
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
    installedAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
    lastHeartbeatAt: null,
    lastVersion: null,
    mcpToolCallCount: 0,
    ...initialState,
  };
  const sendHeartbeat = vi.fn<SelfHostTelemetryDependencies["sendHeartbeat"]>();
  // The real claim is a compare-and-set SQL update; the harness only hands
  // back the stored row so the payload-building path can be exercised.
  const claimHeartbeat = vi.fn(async () => ({ ...state }));
  const markHeartbeatSent =
    vi.fn<SelfHostTelemetryDependencies["markHeartbeatSent"]>();
  const dependencies: Partial<SelfHostTelemetryDependencies> = {
    now: () => NOW,
    isNonProductionBuild: () => false,
    claimHeartbeat,
    collectCounts: async () => emptyCounts,
    collectSetupIssues: async () => [],
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

async function runHeartbeat(
  harness: ReturnType<typeof createHarness>,
  pathname = "/",
) {
  await maybeSendSelfHostHeartbeat(pathname, {
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["local_noauth", "cloudflare_access"])(
    "ignores health probes without consuming the heartbeat in %s mode",
    async (authMode) => {
      vi.stubEnv("AUTH_MODE", authMode);
      const harness = createHarness();

      await runHeartbeat(harness, "/api/health");
      await runHeartbeat(harness, "/api/health/");

      expect(harness.claimHeartbeat).not.toHaveBeenCalled();
      expect(harness.sendHeartbeat).not.toHaveBeenCalled();

      await runHeartbeat(harness, "/mcp");

      expect(harness.sendHeartbeat).toHaveBeenCalledTimes(1);
      expect(harness.sendHeartbeat.mock.calls[0]?.[1]).toMatchObject({
        deployTarget: authMode === "local_noauth" ? "docker" : "cloudflare",
      });
    },
  );

  it.each([
    { mode: "production", prod: true, sends: true },
    { mode: "selfhost", prod: true, sends: true },
    { mode: "preview", prod: true, sends: false },
    { mode: "production", prod: false, sends: false },
  ])(
    "gates heartbeats and MCP counters for mode=$mode, PROD=$prod",
    async ({ mode, prod, sends }) => {
      vi.stubEnv("MODE", mode);
      vi.stubEnv("PROD", prod);
      const harness = createHarness();
      delete harness.dependencies.isNonProductionBuild;

      await runHeartbeat(harness);
      await incrementSelfHostMcpToolCallCount();

      expect(harness.claimHeartbeat).toHaveBeenCalledTimes(sends ? 1 : 0);
      expect(harness.sendHeartbeat).toHaveBeenCalledTimes(sends ? 1 : 0);
      expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledTimes(sends ? 1 : 0);
    },
  );

  it.each([
    ["AUTH_MODE", "hosted"],
    ["OPENSEO_TELEMETRY_DISABLED", "1"],
    ["DO_NOT_TRACK", "1"],
  ])("does not send when %s=%s", async (name, value) => {
    vi.stubEnv(name, value);
    const harness = createHarness();

    await runHeartbeat(harness);

    expect(harness.claimHeartbeat).not.toHaveBeenCalled();
    expect(harness.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("includes the setup-issue summary in heartbeat properties", async () => {
    const harness = createHarness();
    harness.dependencies.collectSetupIssues = async () => ["dataforseo:error"];

    await runHeartbeat(harness);

    expect(harness.sendHeartbeat.mock.calls[0]?.[1]).toMatchObject({
      setupIssues: ["dataforseo:error"],
    });
  });

  it("marks the first heartbeat and resets the reported MCP counter", async () => {
    const harness = createHarness({ mcpToolCallCount: 7 });

    await runHeartbeat(harness);

    expect(harness.sendHeartbeat.mock.calls[0]?.[1]).toMatchObject({
      firstRun: true,
      mcpToolCalls: 7,
    });
    expect(harness.markHeartbeatSent).toHaveBeenCalledWith("1.0.0", 7);
  });

  it("reports minutesSinceInstall from the stored install time", async () => {
    const harness = createHarness({
      installedAt: new Date(NOW.getTime() - 25 * 60 * 1000),
    });

    await runHeartbeat(harness);

    expect(harness.sendHeartbeat.mock.calls[0]?.[1]).toMatchObject({
      minutesSinceInstall: 25,
    });
  });

  it("omits minutesSinceInstall when the install time is unknown", async () => {
    const harness = createHarness({ installedAt: null });

    await runHeartbeat(harness);

    expect(harness.sendHeartbeat.mock.calls[0]?.[1]).not.toHaveProperty(
      "minutesSinceInstall",
    );
  });

  it("includes prevVersion only when the version changes", async () => {
    const changed = createHarness(
      {
        lastHeartbeatAt: new Date("2026-07-17T12:00:00.000Z"),
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
        lastHeartbeatAt: new Date("2026-07-17T12:00:00.000Z"),
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
