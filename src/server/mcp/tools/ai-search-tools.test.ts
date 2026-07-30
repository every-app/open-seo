import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import type {
  BrandLookupResult,
  PromptExplorerResult,
} from "@/types/schemas/ai-search";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getBrandLookup: vi.fn(),
  explorePrompt: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/ai-search/services/brandLookup", () => ({
  getBrandLookup: mocks.getBrandLookup,
}));
vi.mock("@/server/features/ai-search/services/promptExplorer", () => ({
  explorePrompt: mocks.explorePrompt,
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

const baseResult: BrandLookupResult = {
  query: "acme",
  detectedTargetType: "keyword",
  resolvedTarget: "acme",
  fetchedAt: "2026-07-24T00:00:00.000Z",
  hasData: true,
  totalMentions: 42,
  totalAiSearchVolume: 1200,
  perPlatform: [
    {
      platform: "chat_gpt",
      status: "success",
      mentions: 30,
      aiSearchVolume: 800,
    },
    {
      platform: "google",
      status: "success",
      mentions: 12,
      aiSearchVolume: 400,
    },
  ],
  shareOfVoice: {
    platforms: ["chat_gpt", "google"],
    entries: [
      { label: "acme", isTarget: true, mentions: 42, sharePct: 60 },
      { label: "widgetco", isTarget: false, mentions: 28, sharePct: 40 },
    ],
  },
  topPages: [
    {
      url: "https://acme.com/pricing",
      domain: "acme.com",
      platform: "chat_gpt",
      mentions: 10,
      capturedVolume: 300,
      keywords: [{ question: "how much is acme", aiSearchVolume: 50 }],
    },
  ],
  topQueries: [
    {
      question: "what is acme",
      platform: "chat_gpt",
      aiSearchVolume: 100,
      firstSeenAt: "2026-06-01T00:00:00.000Z",
      lastSeenAt: "2026-07-01T00:00:00.000Z",
      citedSources: [
        { url: "https://acme.com", domain: "acme.com", title: "Acme" },
      ],
      brandsMentioned: ["acme", "widgetco"],
    },
  ],
  monthlyVolume: [{ year: 2026, month: 7, volume: 1200 }],
};

const basePromptResult: PromptExplorerResult = {
  prompt: "what is acme",
  highlightBrand: "acme",
  fetchedAt: "2026-07-25T00:00:00.000Z",
  results: [
    {
      status: "success",
      model: "chat_gpt",
      modelName: "gpt-5",
      text: "Acme is a widget company.",
      citations: [
        {
          url: "https://acme.com",
          domain: "acme.com",
          title: "Acme",
          matchedBrand: true,
        },
      ],
      fanOutQueries: ["what does acme sell"],
      brandMentioned: true,
      outputTokens: 128,
      webSearch: true,
    },
    {
      status: "error",
      model: "claude",
      errorCode: "UPSTREAM_ERROR",
      message: "This model is temporarily unavailable. Please try again.",
    },
  ],
};

describe("AI Search MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.getBrandLookup.mockReset();
    mocks.explorePrompt.mockReset();
  });

  it("get_ai_search_visibility returns mentions, share of voice, and no citation fields", async () => {
    mocks.getBrandLookup.mockResolvedValue(baseResult);
    const { getAiSearchVisibilityTool } = await import("./ai-search-tools");

    const result = await getAiSearchVisibilityTool.handler(
      { projectId: "project_1", query: "acme", competitors: ["widgetco"] },
      toolExtra,
    );

    expect(mocks.getBrandLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        query: "acme",
        competitors: ["widgetco"],
        locationCode: 2840,
        languageCode: "en",
      }),
      expect.objectContaining({ organizationId: "org_123" }),
    );
    expect(result.structuredContent).toMatchObject({
      totalMentions: 42,
      totalAiSearchVolume: 1200,
      shareOfVoice: { platforms: ["chat_gpt", "google"] },
    });
    expect(result.structuredContent).not.toHaveProperty("topPages");
    expect(result.structuredContent).not.toHaveProperty("topQueries");
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain("Total mentions: 42");
    expect(text?.type === "text" && text.text).toContain("Share of Voice");
    expect(text?.type === "text" && text.text).toContain(
      "acme (target) | 42 | 60",
    );
  });

  it("get_ai_search_visibility notes when Share of Voice failed despite requested competitors", async () => {
    mocks.getBrandLookup.mockResolvedValue({
      ...baseResult,
      shareOfVoice: null,
    });
    const { getAiSearchVisibilityTool } = await import("./ai-search-tools");

    const result = await getAiSearchVisibilityTool.handler(
      { projectId: "project_1", query: "acme", competitors: ["widgetco"] },
      toolExtra,
    );

    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "Share of Voice unavailable",
    );
  });

  it("get_ai_search_visibility defaults competitors to an empty list when omitted", async () => {
    mocks.getBrandLookup.mockResolvedValue(baseResult);
    const { getAiSearchVisibilityTool } = await import("./ai-search-tools");

    await getAiSearchVisibilityTool.handler(
      { projectId: "project_1", query: "acme" },
      toolExtra,
    );

    expect(mocks.getBrandLookup).toHaveBeenCalledWith(
      expect.objectContaining({ competitors: [] }),
      expect.anything(),
    );
  });

  it("get_ai_search_cited_sources returns cited pages and prompts, and no mention totals", async () => {
    mocks.getBrandLookup.mockResolvedValue(baseResult);
    const { getAiSearchCitedSourcesTool } = await import("./ai-search-tools");

    const result = await getAiSearchCitedSourcesTool.handler(
      { projectId: "project_1", query: "acme" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      topPages: [expect.objectContaining({ url: "https://acme.com/pricing" })],
      topQueries: [expect.objectContaining({ question: "what is acme" })],
    });
    expect(result.structuredContent).not.toHaveProperty("totalMentions");
    expect(result.structuredContent).not.toHaveProperty("shareOfVoice");
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "https://acme.com/pricing",
    );
    expect(text?.type === "text" && text.text).toContain("what is acme");
  });

  it("get_ai_search_cited_sources reports no cited pages/prompts found", async () => {
    mocks.getBrandLookup.mockResolvedValue({
      ...baseResult,
      hasData: false,
      topPages: [],
      topQueries: [],
    });
    const { getAiSearchCitedSourcesTool } = await import("./ai-search-tools");

    const result = await getAiSearchCitedSourcesTool.handler(
      { projectId: "project_1", query: "acme" },
      toolExtra,
    );

    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "No cited pages found.",
    );
    expect(text?.type === "text" && text.text).toContain("No prompts found.");
  });

  it("get_ai_search_prompt_results defaults to chat_gpt and renders per-model text and errors", async () => {
    mocks.explorePrompt.mockResolvedValue(basePromptResult);
    const { getAiSearchPromptResultsTool } = await import("./ai-search-tools");

    const result = await getAiSearchPromptResultsTool.handler(
      { projectId: "project_1", prompt: "what is acme" },
      toolExtra,
    );

    expect(mocks.explorePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        prompt: "what is acme",
        models: ["chat_gpt"],
      }),
      expect.objectContaining({ organizationId: "org_123" }),
    );
    expect(result.structuredContent).toMatchObject({
      prompt: "what is acme",
      results: [
        expect.objectContaining({ model: "chat_gpt", status: "success" }),
        expect.objectContaining({ model: "claude", status: "error" }),
      ],
    });
    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain(
      "Acme is a widget company.",
    );
    expect(text?.type === "text" && text.text).toContain(
      "Citations: https://acme.com (acme.com)",
    );
    expect(text?.type === "text" && text.text).toContain(
      "Error: This model is temporarily unavailable. Please try again.",
    );
    expect(text?.type === "text" && text.text).toContain(
      "chat_gpt | success | yes | 1 | 128",
    );
  });

  it("get_ai_search_prompt_results forwards explicit models and options", async () => {
    mocks.explorePrompt.mockResolvedValue(basePromptResult);
    const { getAiSearchPromptResultsTool } = await import("./ai-search-tools");

    await getAiSearchPromptResultsTool.handler(
      {
        projectId: "project_1",
        prompt: "what is acme",
        models: ["claude", "gemini"],
        highlightBrand: "acme",
        webSearch: false,
        webSearchCountryCode: "GB",
      },
      toolExtra,
    );

    expect(mocks.explorePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ["claude", "gemini"],
        highlightBrand: "acme",
        webSearch: false,
        webSearchCountryCode: "GB",
      }),
      expect.anything(),
    );
  });

  it("get_ai_search_prompt_results reports an empty response as such", async () => {
    mocks.explorePrompt.mockResolvedValue({
      ...basePromptResult,
      results: [
        {
          status: "success",
          model: "chat_gpt",
          modelName: "gpt-5",
          text: "",
          citations: [],
          fanOutQueries: [],
          brandMentioned: null,
          outputTokens: null,
          webSearch: true,
        },
      ],
    });
    const { getAiSearchPromptResultsTool } = await import("./ai-search-tools");

    const result = await getAiSearchPromptResultsTool.handler(
      { projectId: "project_1", prompt: "what is acme" },
      toolExtra,
    );

    const text = result.content?.[0];
    expect(text?.type === "text" && text.text).toContain("(empty response)");
  });
});
