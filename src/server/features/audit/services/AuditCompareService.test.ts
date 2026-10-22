import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuditsByProjectMock,
  getAuditResultsForProjectMock,
} = vi.hoisted(() => ({
  getAuditsByProjectMock: vi.fn(),
  getAuditResultsForProjectMock: vi.fn(),
}));

vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getAuditsByProject: getAuditsByProjectMock,
    getAuditResultsForProject: getAuditResultsForProjectMock,
  },
}));

import { AuditCompareService } from "@/server/features/audit/services/AuditCompareService";

function auditMeta(id: string, startedAt: string) {
  return {
    id,
    startUrl: "https://example.com",
    status: "completed",
    pagesCrawled: 2,
    startedAt,
    completedAt: startedAt,
  };
}

function issue(partial: {
  issueType: string;
  pageUrl: string;
  severity?: "critical" | "warning" | "info";
  detailsJson?: string | null;
}) {
  return {
    id: `${partial.issueType}:${partial.pageUrl}`,
    auditId: "unused",
    pageId: null,
    pageUrl: partial.pageUrl,
    issueType: partial.issueType,
    severity: partial.severity ?? "warning",
    message: partial.issueType,
    detailsJson: partial.detailsJson ?? null,
  };
}

describe("AuditCompareService.compareLatestAudits", () => {
  beforeEach(() => {
    getAuditsByProjectMock.mockReset();
    getAuditResultsForProjectMock.mockReset();
  });

  it("returns need_two_completed when fewer than two completed audits exist", async () => {
    getAuditsByProjectMock.mockResolvedValue([
      { ...auditMeta("a1", "2026-01-02 00:00:00"), status: "completed" },
      { ...auditMeta("a0", "2026-01-01 00:00:00"), status: "failed" },
    ]);

    await expect(
      AuditCompareService.compareLatestAudits("proj-1"),
    ).resolves.toEqual({
      ok: false,
      reason: "need_two_completed",
      completedCount: 1,
    });
    expect(getAuditResultsForProjectMock).not.toHaveBeenCalled();
  });

  it("diffs KPIs and issue groups across the two latest completed audits", async () => {
    getAuditsByProjectMock.mockResolvedValue([
      { ...auditMeta("latest", "2026-01-02 00:00:00"), pagesCrawled: 3 },
      { ...auditMeta("previous", "2026-01-01 00:00:00"), pagesCrawled: 2 },
      { ...auditMeta("older", "2025-12-01 00:00:00"), status: "running" },
    ]);

    getAuditResultsForProjectMock.mockImplementation(
      async (auditId: string) => {
        if (auditId === "latest") {
          return {
            audit: { ...auditMeta("latest", "2026-01-02 00:00:00"), pagesCrawled: 3 },
            pages: [
              { responseTimeMs: 100 },
              { responseTimeMs: 200 },
              { responseTimeMs: 300 },
            ],
            lighthouse: [],
            issues: [
              issue({
                issueType: "missing-title",
                pageUrl: "https://example.com/a",
              }),
              issue({
                issueType: "missing-h1",
                pageUrl: "https://example.com/b",
              }),
            ],
          };
        }
        return {
          audit: {
            ...auditMeta("previous", "2026-01-01 00:00:00"),
            pagesCrawled: 2,
          },
          pages: [{ responseTimeMs: 150 }, { responseTimeMs: 250 }],
          lighthouse: [],
          issues: [
            issue({
              issueType: "missing-title",
              pageUrl: "https://example.com/a",
            }),
            issue({
              issueType: "broken-internal-link",
              pageUrl: "https://example.com/c",
              detailsJson: '{"target":"https://gone.example"}',
            }),
          ],
        };
      },
    );

    const result = await AuditCompareService.compareLatestAudits("proj-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.latest.id).toBe("latest");
    expect(result.previous.id).toBe("previous");
    expect(result.latestKpis.pagesCrawled).toBe(3);
    expect(result.previousKpis.pagesCrawled).toBe(2);
    expect(result.latestKpis.averageResponseMs).toBe(200);
    expect(result.previousKpis.averageResponseMs).toBe(200);

    expect(result.summary).toEqual({
      newCount: 1,
      resolvedCount: 1,
      persistentCount: 1,
    });

    const byType = Object.fromEntries(
      result.issueGroups.map((group) => [group.issueType, group.change]),
    );
    expect(byType["missing-h1"]).toBe("new");
    expect(byType["broken-internal-link"]).toBe("resolved");
    expect(byType["missing-title"]).toBe("persistent");
    expect(
      result.issueGroups.find((group) => group.issueType === "missing-title")
        ?.title,
    ).toBe("Missing title tag");
  });
});
