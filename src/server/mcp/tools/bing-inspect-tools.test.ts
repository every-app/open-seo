import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  inspectUrls: vi.fn(),
}));

class BingNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("not connected");
    this.name = "BingNotConnectedError";
  }
}
class BingTokenError extends Error {}
function isExpectedGrantFailure(error: unknown): boolean {
  return error instanceof BingTokenError;
}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/bing/services/BingService", () => ({
  BingService: { inspectUrls: mocks.inspectUrls },
  BingNotConnectedError,
  isExpectedGrantFailure,
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

describe("inspect_bing_urls", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.inspectUrls.mockReset();
  });

  it("summarizes known, unknown, and errored URLs", async () => {
    mocks.inspectUrls.mockResolvedValue({
      siteUrl: "https://example.com/",
      results: [
        {
          url: "https://example.com/pricing",
          known: true,
          discoveredAt: "2026-04-25T07:00:00.000Z",
          lastCrawledAt: "2026-07-29T09:13:45.000Z",
          documentSize: 127674,
          isPage: true,
          anchorCount: 3,
          totalChildUrlCount: 0,
        },
        {
          url: "https://example.com/never-seen",
          known: false,
          discoveredAt: null,
          lastCrawledAt: null,
          documentSize: 0,
          isPage: false,
          anchorCount: 0,
          totalChildUrlCount: 0,
        },
        { url: "https://example.com/boom", error: "Bing API error (500)" },
      ],
    });
    const { inspectBingUrlsTool } = await import("./bing-inspect-tools");

    const result = await inspectBingUrlsTool.handler(
      {
        projectId: "project_1",
        urls: [
          "https://example.com/pricing",
          "https://example.com/never-seen",
          "https://example.com/boom",
        ],
      },
      toolExtra,
    );

    expect(mocks.inspectUrls).toHaveBeenCalledWith({
      projectId: "project_1",
      urls: [
        "https://example.com/pricing",
        "https://example.com/never-seen",
        "https://example.com/boom",
      ],
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      siteUrl: "https://example.com/",
    });
    const first = result.content[0];
    const text = first.type === "text" ? first.text : "";
    expect(text).toContain("discovered 2026-04-25, last crawled 2026-07-29");
    expect(text).toContain("unknown to Bing (never discovered)");
    expect(text).toContain("error: Bing API error (500)");
  });

  it("reports an errored URL even when the message is empty", async () => {
    // An Error with no message makes `error` falsy, which used to fall through
    // to the crawl-evidence branch and describe a failed lookup as a URL Bing
    // had never discovered.
    mocks.inspectUrls.mockResolvedValue({
      siteUrl: "https://example.com/",
      results: [{ url: "https://example.com/boom", error: "" }],
    });
    const { inspectBingUrlsTool } = await import("./bing-inspect-tools");

    const result = await inspectBingUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/boom"] },
      toolExtra,
    );

    const first = result.content[0];
    const text = first.type === "text" ? first.text : "";
    expect(text).toContain("error:");
    expect(text).not.toContain("unknown to Bing");
    expect(text).not.toContain("last crawled");
  });

  it("returns the connect message for a not-connected project", async () => {
    mocks.inspectUrls.mockRejectedValue(new BingNotConnectedError("p1"));
    const { inspectBingUrlsTool } = await import("./bing-inspect-tools");

    const result = await inspectBingUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_connected",
    });
  });

  it("reports a dead grant as api_error", async () => {
    mocks.inspectUrls.mockRejectedValue(new BingTokenError("revoked"));
    const { inspectBingUrlsTool } = await import("./bing-inspect-tools");

    const result = await inspectBingUrlsTool.handler(
      { projectId: "project_1", urls: ["https://example.com/"] },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "api_error",
    });
  });

  it("propagates unexpected errors rather than masking them", async () => {
    mocks.inspectUrls.mockRejectedValue(new Error("database exploded"));
    const { inspectBingUrlsTool } = await import("./bing-inspect-tools");

    await expect(
      inspectBingUrlsTool.handler(
        { projectId: "project_1", urls: ["https://example.com/"] },
        toolExtra,
      ),
    ).rejects.toThrow("database exploded");
  });
});
