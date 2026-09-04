import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditIssuesTool } from "./site-audit-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getAuditForProject: vi.fn(),
  getIssuesForAudit: vi.fn(),
  hasPagesForAudit: vi.fn(),
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
    getIssuesForAudit: mocks.getIssuesForAudit,
    hasPagesForAudit: mocks.hasPagesForAudit,
  },
}));

const toolContext = makeToolContext();
const AUDIT = { id: "audit_1", startUrl: "https://example.com/" };

beforeEach(() => {
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  mocks.getAuditForProject.mockResolvedValue(AUDIT);
  mocks.getIssuesForAudit.mockResolvedValue([]);
});

describe("get_audit_issues empty-state messages", () => {
  it("says 'no issues found' when the audit ran checks but found nothing", async () => {
    mocks.hasPagesForAudit.mockResolvedValue(true);

    const result = await getAuditIssuesTool.handler(
      { projectId: "project_1", auditId: "audit_1" },
      toolContext,
    );

    expect(textContent(result)).toBe(
      "Audit audit_1 (https://example.com/): no issues found.",
    );
  });

  it("keeps the legacy 'no issue data' hint when the audit has no crawled pages", async () => {
    mocks.hasPagesForAudit.mockResolvedValue(false);

    const result = await getAuditIssuesTool.handler(
      { projectId: "project_1", auditId: "audit_1" },
      toolContext,
    );

    expect(textContent(result)).toContain("No issue data for audit audit_1.");
    expect(textContent(result)).toContain(
      "audits run before issue checks existed have no issue data",
    );
  });

  it("still says 'no issues matching filters' when filters are set", async () => {
    mocks.hasPagesForAudit.mockResolvedValue(true);

    const result = await getAuditIssuesTool.handler(
      {
        projectId: "project_1",
        auditId: "audit_1",
        severity: "critical",
      },
      toolContext,
    );

    expect(textContent(result)).toBe(
      "No issues found for audit audit_1 matching the given filters.",
    );
  });
});
