import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import type { PagespeedSnapshotLike } from "@/shared/pagespeed";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getOverview: vi.fn(),
  getLatestIssues: vi.fn(),
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
  PagespeedService: {
    getOverview: mocks.getOverview,
    getLatestIssues: mocks.getLatestIssues,
  },
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
  {
    id: "u1",
    url: "https://example.com/",
    isHomepage: true,
    scheduleEnabled: true,
    nextRunAt: "2026-07-31T10:00:00.000Z",
  },
  {
    id: "u2",
    url: "https://example.com/pricing",
    isHomepage: false,
    scheduleEnabled: false,
    nextRunAt: null,
  },
];

const snapshots = [
  snapshot({
    id: "s_now",
    urlId: "u1",
    createdAt: "2026-07-29T10:00:00.000Z",
    trigger: "scheduled",
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
      { projectId: "project_1", strategy: "mobile", history: 1 },
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
      { projectId: "project_1", strategy: "mobile", history: 1 },
      toolExtra,
    );

    expect(toolText(result)).toContain("SLOW (origin)");
  });

  it("does not mix strategies", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "desktop", history: 1 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ rowCount: 1 });
    expect(toolText(result)).toContain("99");
  });

  it("filters to a matching URL", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      {
        projectId: "project_1",
        strategy: "mobile",
        url: "/pricing",
        history: 1,
      },
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
      { projectId: "project_1", strategy: "mobile", history: 1 },
      toolExtra,
    );

    expect(toolText(result)).toContain("run failed");
  });

  it("returns a setup prompt, not a throw, when the key is missing", async () => {
    mocks.getOverview.mockRejectedValue(new PagespeedNotConfiguredError());
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile", history: 1 },
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
      { projectId: "project_1", strategy: "mobile", history: 1 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 0 });
    expect(toolText(result)).toContain("/p/project_1/pagespeed");
  });

  it("returns several runs per URL when history is raised", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile", history: 5 },
      toolExtra,
    );

    // u1 has two mobile runs, u2 has one.
    expect(result.structuredContent).toMatchObject({ rowCount: 3 });
    expect(toolText(result)).toContain("up to 5 run(s) each");
  });

  it("reports the trigger and next scheduled run", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    const result = await getPagespeedInsightsTool.handler(
      { projectId: "project_1", strategy: "mobile", history: 1 },
      toolExtra,
    );

    const text = toolText(result);
    expect(text).toContain("trigger");
    expect(text).toContain("scheduled");
    expect(text).toContain("2026-07-31T10:00:00.000Z");
    // A paused URL must be visibly paused, not silently absent.
    expect(text).toContain("paused");
  });

  it("is annotated read-only and closed-world", async () => {
    const { getPagespeedInsightsTool } = await import("./pagespeed-tools");

    expect(getPagespeedInsightsTool.config.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});

function issue(overrides: Record<string, unknown>) {
  return {
    category: "performance",
    auditKey: "unused-javascript",
    title: "Reduce unused JavaScript",
    description: "…",
    score: 0.5,
    scoreDisplayMode: "metricSavings",
    displayValue: "Potential savings of 40 KiB",
    impactMs: null,
    impactBytes: 41000,
    severity: "warning",
    items: [],
    ...overrides,
  };
}

describe("get_pagespeed_issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      domain: "example.com",
    });
  });

  it("lists issues worst-first across URLs", async () => {
    mocks.getLatestIssues.mockResolvedValue([
      {
        url: "https://example.com/",
        snapshotId: "s1",
        runAt: "2026-07-30T10:00:00.000Z",
        available: true,
        issues: [
          issue({ severity: "info", title: "Minor thing", impactBytes: 10 }),
          issue({ severity: "critical", title: "Big problem", impactMs: 900 }),
        ],
      },
    ]);
    const { getPagespeedIssuesTool } = await import("./pagespeed-tools");

    const result = await getPagespeedIssuesTool.handler(
      { projectId: "project_1", strategy: "mobile", limit: 30 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ ok: true, rowCount: 2 });
    const text = toolText(result);
    expect(text.indexOf("Big problem")).toBeLessThan(
      text.indexOf("Minor thing"),
    );
  });

  it("filters to one Lighthouse category", async () => {
    mocks.getLatestIssues.mockResolvedValue([
      {
        url: "https://example.com/",
        snapshotId: "s1",
        runAt: "2026-07-30T10:00:00.000Z",
        available: true,
        issues: [
          issue({ category: "performance", title: "Perf thing" }),
          issue({ category: "seo", title: "SEO thing" }),
        ],
      },
    ]);
    const { getPagespeedIssuesTool } = await import("./pagespeed-tools");

    const result = await getPagespeedIssuesTool.handler(
      {
        projectId: "project_1",
        strategy: "mobile",
        category: "seo",
        limit: 30,
      },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({ rowCount: 1 });
    expect(toolText(result)).toContain("SEO thing");
    expect(toolText(result)).not.toContain("Perf thing");
  });

  it("names URLs whose detail was never stored", async () => {
    mocks.getLatestIssues.mockResolvedValue([
      {
        url: "https://example.com/old",
        snapshotId: "s0",
        runAt: "2026-07-01T10:00:00.000Z",
        available: false,
        issues: [],
      },
    ]);
    const { getPagespeedIssuesTool } = await import("./pagespeed-tools");

    const result = await getPagespeedIssuesTool.handler(
      { projectId: "project_1", strategy: "mobile", limit: 30 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      urlsWithoutDetail: ["https://example.com/old"],
    });
    expect(toolText(result)).toContain("re-run to collect it");
  });

  it("returns a setup prompt, not a throw, when the key is missing", async () => {
    mocks.getLatestIssues.mockRejectedValue(new PagespeedNotConfiguredError());
    const { getPagespeedIssuesTool } = await import("./pagespeed-tools");

    const result = await getPagespeedIssuesTool.handler(
      { projectId: "project_1", strategy: "mobile", limit: 30 },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "not_configured",
    });
  });

  it("is annotated read-only and closed-world", async () => {
    const { getPagespeedIssuesTool } = await import("./pagespeed-tools");
    expect(getPagespeedIssuesTool.config.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
