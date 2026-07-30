import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  addKeywords: vi.fn(),
  removeKeywords: vi.fn(),
  getConfigById: vi.fn(),
  getKeywordCountForConfig: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: {
    addKeywords: mocks.addKeywords,
    removeKeywords: mocks.removeKeywords,
  },
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigById: mocks.getConfigById,
      getKeywordCountForConfig: mocks.getKeywordCountForConfig,
    },
  }),
);

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

describe("rank tracking write MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.addKeywords.mockReset();
    mocks.removeKeywords.mockReset();
    mocks.getConfigById.mockReset();
    mocks.getKeywordCountForConfig.mockReset();
  });

  it("adds keywords and returns a schedule-aware queued cost estimate", async () => {
    mocks.addKeywords.mockResolvedValue({
      added: 2,
      addedIds: ["kw_1", "kw_2"],
    });
    mocks.getConfigById.mockResolvedValue({
      id: "tracker_1",
      domain: "acme.com",
      devices: "both",
      serpDepth: 10,
      scheduleInterval: "weekly",
    });
    mocks.getKeywordCountForConfig.mockResolvedValue(12);
    const { addRankTrackingKeywordsTool } =
      await import("./add-rank-tracking-keywords");

    const result = await addRankTrackingKeywordsTool.handler(
      {
        projectId: "project_1",
        trackerId: "tracker_1",
        keywords: ["seo audit", "technical seo"],
      },
      toolExtra,
    );

    expect(mocks.addKeywords).toHaveBeenCalledWith("tracker_1", "project_1", [
      "seo audit",
      "technical seo",
    ]);
    expect(mocks.removeKeywords).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      added: 2,
      addedIds: ["kw_1", "kw_2"],
      keywordCount: 12,
      costMethod: "queued",
      scheduleInterval: "weekly",
    });
    expect(result.structuredContent).toHaveProperty("costUsd");
    expect(result.structuredContent).toHaveProperty("costCredits");
  });

  it("uses live cost method when the tracker schedule is manual", async () => {
    mocks.addKeywords.mockResolvedValue({ added: 1, addedIds: ["kw_1"] });
    mocks.getConfigById.mockResolvedValue({
      id: "tracker_1",
      domain: "acme.com",
      devices: "desktop",
      serpDepth: 10,
      scheduleInterval: "manual",
    });
    mocks.getKeywordCountForConfig.mockResolvedValue(1);
    const { addRankTrackingKeywordsTool } =
      await import("./add-rank-tracking-keywords");

    const result = await addRankTrackingKeywordsTool.handler(
      {
        projectId: "project_1",
        trackerId: "tracker_1",
        keywords: ["seo"],
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      costMethod: "live",
      scheduleInterval: "manual",
    });
  });

  it("removes keywords by id without triggering a check", async () => {
    mocks.removeKeywords.mockResolvedValue(undefined);
    const { removeRankTrackingKeywordsTool } =
      await import("./remove-rank-tracking-keywords");

    const result = await removeRankTrackingKeywordsTool.handler(
      {
        projectId: "project_1",
        trackerId: "tracker_1",
        keywordIds: [
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        ],
      },
      toolExtra,
    );

    expect(mocks.removeKeywords).toHaveBeenCalledWith(
      "tracker_1",
      "project_1",
      [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ],
    );
    expect(mocks.addKeywords).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      removed: 2,
      trackerId: "tracker_1",
    });
  });
});
