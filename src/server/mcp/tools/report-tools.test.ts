import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import {
  REPORT_MAX_PER_PROJECT,
  type ReportMetadata,
} from "@/types/schemas/reports";
import { getReportTool, listReportsTool, saveReportTool } from "./report-tools";
import { setReportSharingTool } from "./report-sharing-tools";
import { makeToolContext, textContent } from "./tool-test-support";

// Mocked at the repository seam, not the service: the tools' contract is that a
// save reaches storage with the right attribution and reads back through the
// real caps and the real refusal copy.
const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listReports: vi.fn(),
  getReport: vi.fn(),
  getReportWithHtml: vi.fn(),
  findReportByTitle: vi.fn(),
  countReports: vi.fn(),
  sumReportBytesForOrganization: vi.fn(),
  // Typed so the brand test can read the stored HTML off the call.
  insertReport: vi.fn<(params: { html: string }) => Promise<void>>(),
  updateReportContent: vi.fn(),
  getTemplate: vi.fn(),
  captureServerEvent: vi.fn(),
  setShareToken: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/reports/repositories/ReportRepository", () => ({
  ReportRepository: mocks,
}));
vi.mock(
  "@/server/features/reports/repositories/ReportTemplateRepository",
  () => ({ ReportTemplateRepository: mocks }),
);
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

const projectId = "project_1";
const reportId = "report_1";
const html = "<!doctype html><html><body><h1>Audit</h1></body></html>";

const storedReport = (
  overrides: Partial<ReportMetadata> = {},
): ReportMetadata => ({
  id: reportId,
  projectId,
  title: "badseo.dev SEO audit, Sep 2026",
  summary: "Verdict: titles are the problem.",
  skill: "seo-audit",
  templateId: null,
  createdBy: "Claude Code",
  createdByUserId: "user_123",
  sizeBytes: 15_517,
  shareToken: null,
  sharedAt: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  mocks.isHostedServerAuthMode.mockResolvedValue(true);
  mocks.setShareToken.mockResolvedValue(true);
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
  mocks.countReports.mockResolvedValue(3);
  mocks.sumReportBytesForOrganization.mockResolvedValue(0);
  mocks.findReportByTitle.mockResolvedValue(null);
  mocks.getTemplate.mockResolvedValue(null);
  mocks.captureServerEvent.mockResolvedValue(undefined);
});

const toolContext = makeToolContext({ clientLabel: "Claude Code" });

describe("save_report", () => {
  it("creates a report attributed to the client and answers with its app URL", async () => {
    const result = await saveReportTool.handler(
      {
        projectId,
        title: "badseo.dev SEO audit, Sep 2026",
        summary: "Verdict: titles are the problem.",
        html,
        skill: "seo-audit",
      },
      toolContext,
    );

    expect(mocks.insertReport).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        skill: "seo-audit",
        createdBy: "Claude Code",
        createdByUserId: "user_123",
      }),
    );
    const saved = result.structuredContent;
    expect(saved.created).toBe(true);
    expect(mocks.setShareToken).not.toHaveBeenCalled();
    expect(mocks.insertReport.mock.calls[0][0]).not.toHaveProperty(
      "shareToken",
    );
    expect(saved.url).toBe(
      `https://open-seo.test/p/${projectId}/reports/${saved.reportId}`,
    );
    expect(textContent(result)).toContain(saved.url);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "report:saved",
        properties: {
          project_id: projectId,
          skill: "seo-audit",
          used_template: false,
          size_bytes: new TextEncoder().encode(html).length,
          client: "Claude Code",
          is_update: false,
          source: "mcp",
        },
      }),
    );
  });

  it("refuses a templateId that does not resolve in this project", async () => {
    // The template lookup is project-scoped, so another project's template
    // reads exactly like a deleted one.
    await expect(
      saveReportTool.handler(
        {
          projectId,
          title: "badseo.dev SEO audit, Sep 2026",
          summary: "Verdict: titles are the problem.",
          html,
          templateId: "template_other_project",
        },
        toolContext,
      ),
    ).rejects.toThrow(/No report template template_other_project/);
    expect(mocks.insertReport).not.toHaveBeenCalled();
  });

  it("writes the followed template's brand kit into the stored HTML", async () => {
    mocks.getTemplate.mockResolvedValue({
      id: "template_1",
      brandColor: "#ff5700",
      brandColor2: null,
      accentColor: "#b83d00",
      canvasColor: null,
      logoDataUri: null,
    });

    await saveReportTool.handler(
      {
        projectId,
        title: "badseo.dev SEO audit, Sep 2026",
        summary: "Verdict: titles are the problem.",
        html,
        templateId: "template_1",
      },
      toolContext,
    );

    expect(mocks.insertReport.mock.calls[0]?.[0].html).toContain(
      '<style id="openseo-brand">:root{--brand:#ff5700;--accent:#b83d00}</style><body>',
    );
  });
});

describe("list_reports", () => {
  it("truncates the summary in both the text block and the structured rows", async () => {
    const longSummary = "x".repeat(400);
    mocks.listReports.mockResolvedValue([
      storedReport({ summary: longSummary }),
    ]);
    mocks.countReports.mockResolvedValue(1);

    const result = await listReportsTool.handler({ projectId }, toolContext);

    expect(mocks.listReports).toHaveBeenCalledWith({
      projectId,
      limit: 20,
      offset: 0,
    });
    const rows = result.structuredContent.reports;
    expect(rows[0].summary).toBe(`${"x".repeat(300)}…`);
    expect(result.structuredContent).toMatchObject({
      totalCount: 1,
      rowCount: 1,
      remaining: REPORT_MAX_PER_PROJECT - 1,
    });
    const text = textContent(result);
    expect(text).toContain(`${"x".repeat(300)}…`);
    expect(text).not.toContain("x".repeat(301));
    expect(text).toContain("1 reports.");
  });
});

describe("get_report", () => {
  it("returns the summary without the document, and the document on request", async () => {
    mocks.getReport.mockResolvedValue(storedReport());
    mocks.getReportWithHtml.mockResolvedValue({ ...storedReport(), html });

    const metadataOnly = await getReportTool.handler(
      { projectId, reportId },
      toolContext,
    );
    expect(mocks.getReportWithHtml).not.toHaveBeenCalled();
    expect(textContent(metadataOnly)).not.toContain(html);
    expect(metadataOnly.structuredContent.report.shareUrl).toBeNull();

    const withHtml = await getReportTool.handler(
      { projectId, reportId, includeHtml: true },
      toolContext,
    );
    expect(textContent(withHtml)).toContain(html);
  });
});

describe("public report sharing", () => {
  it("publishes, retrieves, preserves on save, and revokes", async () => {
    let stored = storedReport();
    mocks.getReport.mockImplementation(async () => stored);
    mocks.getReportWithHtml.mockImplementation(async () => ({
      ...stored,
      html,
    }));
    mocks.setShareToken.mockImplementation(
      async (
        _project: string,
        _report: string,
        share: { shareToken: string; sharedAt: string } | null,
      ) => {
        stored = { ...stored, shareToken: null, sharedAt: null, ...share };
        return true;
      },
    );
    const setSharing = (isPublic: boolean) =>
      setReportSharingTool.handler(
        { projectId, reportId, public: isPublic },
        toolContext,
      );

    const published = await setSharing(true);
    const shareUrl = published.structuredContent.shareUrl;
    expect(shareUrl).toMatch(
      /^https:\/\/open-seo\.test\/s\/[A-Za-z0-9_-]{32}$/,
    );
    expect(textContent(published)).toContain(shareUrl!);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "report:shared",
        distinctId: "user_123",
        organizationId: "org_123",
        properties: {
          project_id: projectId,
          report_id: reportId,
          skill: "seo-audit",
          source: "mcp",
        },
      }),
    );

    for (const includeHtml of [false, true]) {
      const fetched = await getReportTool.handler(
        { projectId, reportId, includeHtml },
        toolContext,
      );
      expect(fetched.structuredContent.report.shareUrl).toBe(shareUrl);
      expect(fetched.structuredContent.report).not.toHaveProperty("shareToken");
      expect(textContent(fetched)).toContain(shareUrl!);
    }
    await saveReportTool.handler(
      {
        projectId,
        reportId,
        title: stored.title,
        summary: stored.summary,
        html,
      },
      toolContext,
    );
    expect(mocks.setShareToken).toHaveBeenCalledTimes(1);
    expect(mocks.updateReportContent.mock.calls[0][0]).not.toHaveProperty(
      "shareToken",
    );

    const revoked = await setSharing(false);
    expect(revoked.structuredContent).toMatchObject({
      public: false,
      shareUrl: null,
    });
    expect(mocks.setShareToken).toHaveBeenLastCalledWith(
      projectId,
      reportId,
      null,
    );
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "report:unshared",
        properties: {
          project_id: projectId,
          report_id: reportId,
          skill: "seo-audit",
          source: "mcp",
        },
      }),
    );
    expect(
      (await getReportTool.handler({ projectId, reportId }, toolContext))
        .structuredContent.report.shareUrl,
    ).toBeNull();
  });

  it("does not expose public links in bulk lists or mint links on reads", async () => {
    const token = "a".repeat(32);
    mocks.getReport.mockResolvedValue(storedReport());
    mocks.listReports.mockResolvedValue([storedReport({ shareToken: token })]);
    await getReportTool.handler({ projectId, reportId }, toolContext);
    const list = await listReportsTool.handler({ projectId }, toolContext);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(mocks.setShareToken).not.toHaveBeenCalled();
  });

  it("hides unusable share URLs on self-hosted deployments but permits revocation", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.getReport.mockResolvedValue(
      storedReport({ shareToken: "a".repeat(32) }),
    );
    const fetched = await getReportTool.handler(
      { projectId, reportId },
      toolContext,
    );
    expect(fetched.structuredContent.report.shareUrl).toBeNull();
    await setReportSharingTool.handler(
      { projectId, reportId, public: false },
      toolContext,
    );
    expect(mocks.setShareToken).toHaveBeenCalledWith(projectId, reportId, null);
  });

  it("authorizes the project before changing sharing", async () => {
    mocks.getProjectForOrganization.mockRejectedValueOnce(
      new AppError("FORBIDDEN"),
    );
    await expect(
      setReportSharingTool.handler(
        { projectId, reportId, public: true },
        toolContext,
      ),
    ).rejects.toThrow();
    expect(mocks.getReport).not.toHaveBeenCalled();
    expect(mocks.setShareToken).not.toHaveBeenCalled();
  });

  // Restored: ReportService.test no longer owns the unknown-id refusal on the
  // read path that share/unshare go through.
  it("refuses missing or foreign report ids when changing sharing", async () => {
    mocks.getReport.mockResolvedValue(null);
    await expect(
      setReportSharingTool.handler(
        { projectId, reportId: "foreign_report", public: true },
        toolContext,
      ),
    ).rejects.toThrow("No report foreign_report in this project.");
    expect(mocks.getReport).toHaveBeenCalledWith(projectId, "foreign_report");
    expect(mocks.setShareToken).not.toHaveBeenCalled();
  });
});
