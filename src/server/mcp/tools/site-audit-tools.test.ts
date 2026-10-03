import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditIssuesTool } from "./site-audit-tools";
import { makeToolContext, textContent } from "./tool-test-support";

// Pins the get_audit_issues 0-rows copy: a completed audit whose issue
// reporters ran and found nothing says so; only audits predating the checks
// keep the re-run hint.

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getAuditForProject: vi.fn(),
  getLatestAuditForProject: vi.fn(),
  getIssuesForAudit: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getAuditForProject: mocks.getAuditForProject,
    getLatestAuditForProject: mocks.getLatestAuditForProject,
    getIssuesForAudit: mocks.getIssuesForAudit,
  },
}));

const toolContext = makeToolContext();

const freshAudit = {
  id: "audit_1",
  startUrl: "https://example.com",
  pagesCrawled: 68,
  issuesChecked: true,
};

describe("get_audit_issues", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.getIssuesForAudit.mockResolvedValue([]);
    mocks.getLatestAuditForProject.mockResolvedValue(freshAudit);
  });

  it("tells a freshly-checked audit that no issues were found", async () => {
    const result = await getAuditIssuesTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain("checked 68 pages and found no issues");
    expect(out).not.toContain("re-run");
  });

  it("keeps the re-run hint for audits that predate the issue checks", async () => {
    mocks.getLatestAuditForProject.mockResolvedValue({
      ...freshAudit,
      issuesChecked: false,
    });

    const result = await getAuditIssuesTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(textContent(result)).toContain("have no issue data");
  });
});
