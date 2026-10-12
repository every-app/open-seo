import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeSavedKeywordsTool } from "./remove-saved-keywords";
import { deleteReportTool } from "./report-tools";
import { deleteReportTemplateTool } from "./report-template-tools";
import { deleteSiteAuditTool } from "./site-audit-cleanup-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  deleteReport: vi.fn(),
  removeSavedKeywords: vi.fn(),
  deleteTemplate: vi.fn(),
  getAuditForProject: vi.fn(),
  deleteAuditForProject: vi.fn(),
  terminate: vi.fn(),
  status: vi.fn(),
  destroyScratchpad: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    SITE_AUDIT_WORKFLOW: { get: async () => mocks },
    AUDIT_ENGINE: { destroyScratchpad: mocks.destroyScratchpad },
  },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: mocks,
  }),
);
vi.mock("@/server/features/reports/repositories/ReportRepository", () => ({
  ReportRepository: mocks,
}));
vi.mock(
  "@/server/features/reports/repositories/ReportTemplateRepository",
  () => ({
    ReportTemplateRepository: mocks,
  }),
);
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: mocks,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  mocks.deleteReport.mockResolvedValue(true);
  mocks.deleteTemplate.mockResolvedValue(true);
  mocks.removeSavedKeywords.mockResolvedValue(1);
  mocks.getAuditForProject.mockResolvedValue({
    id: "audit_1",
    status: "completed",
  });
});

const context = makeToolContext();
const deletes = [
  {
    name: deleteReportTool.name,
    call: () =>
      deleteReportTool.handler(
        { projectId: "project_1", reportId: "report_1" },
        context,
      ),
    storage: mocks.deleteReport,
    scopedArgs: ["project_1", "report_1"],
  },
  {
    name: deleteReportTemplateTool.name,
    call: () =>
      deleteReportTemplateTool.handler(
        { projectId: "project_1", templateId: "template_1" },
        context,
      ),
    storage: mocks.deleteTemplate,
    scopedArgs: ["project_1", "template_1"],
  },
  {
    name: deleteSiteAuditTool.name,
    call: () =>
      deleteSiteAuditTool.handler(
        { projectId: "project_1", auditId: "audit_1" },
        context,
      ),
    storage: mocks.deleteAuditForProject,
    scopedArgs: ["audit_1", "project_1"],
  },
  {
    name: removeSavedKeywordsTool.name,
    call: () =>
      removeSavedKeywordsTool.handler(
        { projectId: "project_1", savedKeywordIds: ["saved_1", "saved_2"] },
        context,
      ),
    storage: mocks.removeSavedKeywords,
    scopedArgs: [["saved_1", "saved_2"], "project_1"],
  },
];

describe.each(deletes)("$name", ({ call, storage, scopedArgs }) => {
  it("deletes only within the authorized project", async () => {
    await call();
    expect(storage).toHaveBeenCalledWith(...scopedArgs);
  });

  it("refuses an inaccessible project before deleting anything", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storage).not.toHaveBeenCalled();
  });
});

describe("site audit cleanup", () => {
  it("refuses an audit that is missing or belongs to another project", async () => {
    mocks.getAuditForProject.mockResolvedValue(null);
    await expect(
      deleteSiteAuditTool.handler(
        { projectId: "project_1", auditId: "audit_1" },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.deleteAuditForProject).not.toHaveBeenCalled();
  });

  it("preserves the dashboard's role restriction", async () => {
    await expect(
      deleteSiteAuditTool.handler(
        { projectId: "project_1", auditId: "audit_1" },
        makeToolContext({ role: "member" }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getAuditForProject).not.toHaveBeenCalled();
    expect(mocks.deleteAuditForProject).not.toHaveBeenCalled();
  });

  it("stops a running workflow before deleting its results and scratchpad", async () => {
    mocks.getAuditForProject.mockResolvedValue({
      id: "audit_1",
      status: "running",
      workflowInstanceId: "workflow_1",
    });
    await deleteSiteAuditTool.handler(
      { projectId: "project_1", auditId: "audit_1" },
      context,
    );
    expect(mocks.terminate).toHaveBeenCalledOnce();
    expect(mocks.terminate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteAuditForProject.mock.invocationCallOrder[0],
    );
    expect(mocks.destroyScratchpad).toHaveBeenCalledWith("audit_1");
  });

  it("keeps data when a workflow cannot be stopped", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getAuditForProject.mockResolvedValue({
      id: "audit_1",
      status: "running",
      workflowInstanceId: "workflow_1",
    });
    mocks.terminate.mockRejectedValue(new Error("Still running"));
    mocks.status.mockResolvedValue({ status: "running" });
    await expect(
      deleteSiteAuditTool.handler(
        { projectId: "project_1", auditId: "audit_1" },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.deleteAuditForProject).not.toHaveBeenCalled();
  });
});
