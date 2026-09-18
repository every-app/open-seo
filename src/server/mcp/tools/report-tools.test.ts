import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_MAX_PER_PROJECT } from "@/types/schemas/reports";
import { getReportTool, listReportsTool, saveReportTool } from "./report-tools";
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
  insertReport: vi.fn(),
  updateReportContent: vi.fn(),
  getTemplate: vi.fn(),
  captureServerEvent: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
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

const storedReport = (overrides: Record<string, unknown> = {}) => ({
  id: reportId,
  projectId,
  title: "badseo.dev SEO audit, Sep 2026",
  summary: "Verdict: titles are the problem.",
  skill: "seo-audit",
  createdBy: "Claude Code",
  createdByUserId: "user_123",
  sizeBytes: 15_517,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
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

  it("replaces the existing report when a reportId is passed, keeping its attribution", async () => {
    mocks.getReport.mockResolvedValue(storedReport());

    const result = await saveReportTool.handler(
      {
        projectId,
        reportId,
        title: "badseo.dev SEO audit, Sep 2026",
        summary: "Verdict: titles are still the problem.",
        html,
      },
      toolContext,
    );

    expect(mocks.insertReport).not.toHaveBeenCalled();
    expect(mocks.updateReportContent).toHaveBeenCalledWith(
      expect.objectContaining({ reportId, projectId }),
    );
    expect(result.structuredContent.created).toBe(false);
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

  it("passes a service refusal through with its message", async () => {
    mocks.findReportByTitle.mockResolvedValue({
      id: reportId,
      title: "badseo.dev SEO audit, Sep 2026",
    });

    await expect(
      saveReportTool.handler(
        {
          projectId,
          title: "badseo.dev SEO audit, Sep 2026",
          summary: "Verdict.",
          html,
        },
        toolContext,
      ),
    ).rejects.toThrow(/Pass reportId to update it/);
    expect(mocks.insertReport).not.toHaveBeenCalled();
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
    expect(metadataOnly.structuredContent.report).toMatchObject({
      htmlBytes: 15_517,
    });

    const withHtml = await getReportTool.handler(
      { projectId, reportId, includeHtml: true },
      toolContext,
    );
    expect(textContent(withHtml)).toContain(html);
  });
});
