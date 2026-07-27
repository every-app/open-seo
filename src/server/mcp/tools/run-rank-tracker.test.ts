import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

// run_rank_tracker spends credits, so the two outcomes that matter are
// "a run started" and "one was already in flight". The second must not read
// as a failure — a caller that treats it as one retries and double-charges.

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getConfigById: vi.fn(),
  triggerCheck: vi.fn(),
  captureServerEvent: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: { getConfigById: mocks.getConfigById },
  }),
);
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: { triggerCheck: mocks.triggerCheck },
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

function text(result: { content?: Array<{ type: string; text?: string }> }) {
  const first = result.content?.[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

const config = {
  id: "tracker_1",
  domain: "example.com",
  scheduleInterval: "weekly",
  devices: "desktop",
  serpDepth: 40,
};

describe("run_rank_tracker", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.captureServerEvent.mockResolvedValue(undefined);
  });

  it("starts a check and returns the run id", async () => {
    mocks.getConfigById.mockResolvedValue(config);
    mocks.triggerCheck.mockResolvedValue({ ok: true, runId: "run_1" });
    const { runRankTrackerTool } = await import("./run-rank-tracker");

    const result = await runRankTrackerTool.handler(
      { projectId: "project_1", trackerId: "tracker_1" },
      toolExtra,
    );

    expect(mocks.triggerCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: "tracker_1",
        projectId: "project_1",
      }),
    );
    expect(text(result)).toContain("run_1");
    expect(text(result)).toContain("example.com");
    expect(result.structuredContent).toMatchObject({
      runId: "run_1",
      started: true,
    });
  });

  it("reports an in-flight run as started:false without charging again", async () => {
    mocks.getConfigById.mockResolvedValue(config);
    mocks.triggerCheck.mockResolvedValue({
      ok: false,
      reason: "already_running",
      blockingRunId: "run_0",
    });
    const { runRankTrackerTool } = await import("./run-rank-tracker");

    const result = await runRankTrackerTool.handler(
      { projectId: "project_1", trackerId: "tracker_1" },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain("already running");
    expect(out).toContain("run_0");
    expect(out).toContain("nothing was charged");
    expect(result.structuredContent).toMatchObject({ started: false });
    // No telemetry for a run that never began.
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });

  it("rejects a tracker that does not belong to the project", async () => {
    mocks.getConfigById.mockResolvedValue(null);
    const { runRankTrackerTool } = await import("./run-rank-tracker");

    await expect(
      runRankTrackerTool.handler(
        { projectId: "project_1", trackerId: "tracker_missing" },
        toolExtra,
      ),
    ).rejects.toThrow(/not found/i);
    expect(mocks.triggerCheck).not.toHaveBeenCalled();
  });
});
