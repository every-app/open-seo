import { beforeEach, expect, it, vi } from "vitest";
import { DashboardService } from "./DashboardService";

const repository = vi.hoisted(() => ({
  audits: vi.fn(),
  latestAudit: vi.fn(),
  issues: vi.fn(),
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {},
}));
vi.mock(
  "@/server/features/activation/repositories/ActivationRepository",
  () => ({ ActivationRepository: {} }),
);
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: {},
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: {},
}));
vi.mock("@/server/features/bing/repositories/BingConnectionRepository", () => ({
  BingConnectionRepository: {},
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getAuditsByProject: repository.audits,
    getLatestAuditForProject: repository.latestAudit,
  },
}));
vi.mock("@/server/features/audit/repositories/auditSummaryQueries", () => ({
  getIssueTypePageCountsForAudit: repository.issues,
}));

const ownAudit = {
  id: "own-site",
  startUrl: "https://www.example.com/about",
  status: "completed",
  pagesCrawled: 50,
  startedAt: "2026-10-01T00:00:00Z",
};
const competitor = {
  ...ownAudit,
  id: "competitor",
  startUrl: "https://example.com.other.net/",
};

beforeEach(() => {
  repository.audits.mockResolvedValue([competitor, ownAudit]);
  repository.latestAudit.mockResolvedValue(competitor);
  repository.issues.mockResolvedValue([]);
});

it("shows the newest audit matching the saved website instead of a newer competitor audit", async () => {
  const result = await DashboardService.getOverview({
    projectId: "project",
    domain: "example.com",
  });
  expect(result.audit?.id).toBe("own-site");
});

it.each([null, "other.example.com", "example.net"])(
  "shows no audit when the saved website is %s",
  async (domain) => {
    expect(
      await DashboardService.getOverview({ projectId: "project", domain }),
    ).toEqual({ audit: null });
    expect(repository.issues).not.toHaveBeenCalled();
  },
);
