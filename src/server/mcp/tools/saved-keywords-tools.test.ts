import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getSavedKeywords: vi.fn(),
  saveKeywords: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: {
    getSavedKeywords: mocks.getSavedKeywords,
    saveKeywords: mocks.saveKeywords,
  },
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

describe("saved keyword MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.getSavedKeywords.mockReset();
    mocks.saveKeywords.mockReset();
  });

  it("passes tags through save_keywords", async () => {
    mocks.saveKeywords.mockResolvedValue({
      success: true,
      savedKeywordIds: ["saved_1"],
    });
    const { saveKeywordsTool } = await import("./save-keywords");

    const result = await saveKeywordsTool.handler(
      {
        projectId: "project_1",
        keywords: ["technical seo"],
        tags: ["Content"],
      },
      toolExtra,
    );

    expect(mocks.saveKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      keywords: ["technical seo"],
      tags: ["Content"],
      tagMode: "append",
      locationCode: 2840,
      languageCode: "en",
    });
    expect(result.structuredContent).toMatchObject({
      savedCount: 1,
      tags: ["Content"],
      tagMode: "append",
    });
  });

  it("replaces tags through save_keywords when requested", async () => {
    mocks.saveKeywords.mockResolvedValue({
      success: true,
      savedKeywordIds: ["saved_1", "saved_2"],
    });
    const { saveKeywordsTool } = await import("./save-keywords");

    const result = await saveKeywordsTool.handler(
      {
        projectId: "project_1",
        keywords: ["semrush alternative", "semrush pricing"],
        tags: ["cluster: affordable semrush alternatives"],
        tagMode: "replace",
      },
      toolExtra,
    );

    expect(mocks.saveKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      keywords: ["semrush alternative", "semrush pricing"],
      tags: ["cluster: affordable semrush alternatives"],
      tagMode: "replace",
      locationCode: 2840,
      languageCode: "en",
    });
    expect(result.structuredContent).toMatchObject({
      savedCount: 2,
      tags: ["cluster: affordable semrush alternatives"],
      tagMode: "replace",
    });
  });

  it("rejects replace mode without replacement tags before saving", async () => {
    const { saveKeywordsTool } = await import("./save-keywords");

    await expect(() =>
      saveKeywordsTool.handler(
        {
          projectId: "project_1",
          keywords: ["semrush alternative"],
          tagMode: "replace",
        },
        toolExtra,
      ),
    ).rejects.toThrow("Replacement tags are required");
    expect(mocks.saveKeywords).not.toHaveBeenCalled();
  });

  it("filters list_saved_keywords by search and tag names", async () => {
    mocks.getSavedKeywords.mockResolvedValue({
      totalCount: 1,
      tags: [
        {
          id: "tag_1",
          name: "Content",
          normalizedName: "content",
          keywordCount: 1,
        },
      ],
      rows: [
        {
          id: "saved_1",
          keyword: "technical seo",
          searchVolume: 120,
          keywordDifficulty: 18,
          cpc: 2.5,
          tags: [{ id: "tag_1", name: "Content", normalizedName: "content" }],
        },
      ],
    });
    const { listSavedKeywordsTool } = await import("./list-saved-keywords");

    const result = await listSavedKeywordsTool.handler(
      {
        projectId: "project_1",
        search: "technical",
        tags: ["Content"],
        limit: 50,
      },
      toolExtra,
    );

    expect(mocks.getSavedKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      search: "technical",
      tagNames: ["Content"],
      page: 1,
      pageSize: 50,
      sort: "createdAt",
      order: "desc",
    });
    expect(result.structuredContent).toMatchObject({
      totalCount: 1,
      rows: [{ keyword: "technical seo" }],
    });
    const [content] = result.content;
    expect(content).toMatchObject({ type: "text" });
    expect(content?.type === "text" ? content.text : "").toContain(
      "tags:Content",
    );
  });
});
