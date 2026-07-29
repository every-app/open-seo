import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import type { PagespeedSnapshotLike } from "@/shared/pagespeed";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getOverview: vi.fn(),
}));

class PagespeedNotConfiguredError extends Error {
  constructor() {
    super("not configured");
    this.name = "PagespeedNotConfiguredError";
  }
}

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/pagespeed/services/PagespeedService", () => ({
  PagespeedService: { getOverview: mocks.getOverview },
  PagespeedNotConfiguredError,
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

/** Narrow the tool's content union down to its leading text block. */
function toolText(result: { content: readonly unknown[] }): string {
  const first = result.content[0];
  return first &&
    typeof first === "object" &&
    "text" in first &&
    typeof first.text === "string"
    ? first.text
    : "";
}

function snapshot(
  overrides: Partial<PagespeedSnapshotLike> & {
    id: string;
    urlId: string;
    createdAt: string;
  },
): PagespeedSnapshotLike {
  return {
    strategy: "mobile",
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    lcpMs: null,
    cls: null,
    tbtMs: null,
    fcpMs: null,
    speedIndexMs: null,
    ttfbMs: null,
    fieldLcpMs: null,
    fieldInpMs: null,
    fieldCls: null,
    fieldOverallCategory: null,
    fieldSource: null,
    fetchTime: null,
    errorMessage: null,
    ...overrides,
  };
}

const urls = [
  { id: "u1", url: "https://example.com/", isHomepage: true },
  { id: "u2", url: "https://example.com/pricing", isHomepage: false },
];

const snapshots = [
  snapshot({
    id: "s_now",
    urlId: "u1",
    createdAt: "2026-07-29T10:00:00.000Z",
    performanceScore: 92,
    accessibilityScore: 88,
    bestPracticesScore: 100,
    seoScore: 100,
    lcpMs: 2400,
    cls: 0.02,
    tbtMs: 150,
    fieldLcpMs: 2100,
    fieldInpMs: 180,
    fieldCls: 0.05,
    fieldOverallCategory: "AVERAGE",
    fieldSource: "url",
  }),
  snapshot({
    id: "s_prev",
    urlId: "u1",
    createdAt: "2026-07-28T10:00:00.000Z",
    performanceScore: 89,
    seoScore: 100,
  }),
  snapshot({
    id: "s_desktop",
    urlId: "u1",
    createdAt: "2026-07-29T10:00:00.000Z",
    strategy: "desktop",
    performanceScore: 99,
  }),
  snapshot({
    id: "s_pricing",
    urlId: "u2",
    createdAt: "2026-07-29T10:00:00.000Z",
    performanceScore: 45,
    fieldSource: "origin",
    fieldOverallCategory: "SLOW",
    fieldLcpMs: 4200,
  }),
];

describe("get_pagespeed_insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      domain: "example.com",
    });
    mocks.getOverview.mockResolvedValue({ urls, snapshots });
  });

  it("reports the latest mobile run per URL with a delta", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: true,
      strategy: "mobile",
      rowCount: 2,
    });
    const text = toolText(result);
    // 92 now vs 89 before.
    expect(text).toContain("92 (+3)");
    // Unchanged scores carry no delta.
    expect(text).toContain("100");
    expect(text).toContain("2.1 s");
    expect(text).toContain("AVERAGE");
  });

  it("labels origin-fallback field data", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile" },
      toolExtra,
    );

    expect(toolText(result)).toContain("SLOW (origin)");
  });

  it("does not mix strategies", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "desktop" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ rowCount: 1 });
    expect(toolText(result)).toContain("99");
  });

  it("filters to a matching URL", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile", url: "/pricing" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ rowCount: 1 });
    expect(toolText(result)).toContain("/pricing");
    expect(toolText(result)).not.toContain("92 (+3)");
  });

  it("reports a run failure rather than stale numbers", async () => {
    mocks.getOverview.mockResolvedValue({
      urls: [urls[0]],
      snapshots: [
        ...snapshots,
        snapshot({
          id: "s_err",
          urlId: "u1",
          createdAt: "2026-07-30T10:00:00.000Z",
          errorMessage: "PageSpeed Insights daily quota reached.",
        }),
      ],
    });
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile" },
      toolExtra,
    );

    expect(toolText(result)).toContain("run failed");
  });

  it("returns a setup prompt, not a throw, when the key is missing", async () => {
    mocks.getOverview.mockRejectedValue(new PagespeedNotConfiguredError());
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_configured",
      connectUrl: "https://open-seo.test/p/project_1/settings",
    });
    expect(toolText(result)).toContain("PAGESPEED_API_KEY");
  });

  it("points at the page when nothing has been run yet", async () => {
    mocks.getOverview.mockResolvedValue({ urls, snapshots: [] });
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 0 });
    expect(toolText(result)).toContain("/p/project_1/pagespeed");
  });

  it("is annotated read-only and closed-world", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    expect(getPagespeedInsightsTool.config.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
