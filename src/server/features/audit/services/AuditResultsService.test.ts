import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditResultsService } from "./AuditResultsService";

const { testDb, db } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  const { drizzle } = await import("drizzle-orm/libsql");
  const auditSchema = await import("@/db/audit.schema");
  const sqlite = await createAiVisibilityTestDb();
  // The audit schema too, for the repository's relational `db.query` reads.
  return {
    testDb: sqlite,
    db: drizzle(sqlite.client, { schema: auditSchema }),
  };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db }));

type PagesInput = Parameters<typeof AuditResultsService.getPages>[0];

const defaults: PagesInput = {
  auditId: "audit",
  page: 1,
  pageSize: 100,
  sort: "url",
  order: "asc",
  status: "all",
  fetchClass: "all",
  missingAlt: "all",
};

beforeEach(async () => {
  await testDb.seedProject();
  await testDb.client.executeMultiple(`
    INSERT INTO audits (id, project_id, started_by_user_id, start_url, status, config)
      VALUES ('audit', 'project', 'user', 'https://example.com/', 'completed', '{"maxPages":100,"lighthouseStrategy":"none"}');
    INSERT INTO audit_pages (id, audit_id, url, status_code, title, response_time_ms, fetch_class) VALUES
      ('a', 'audit', 'https://www.example.com/a', 200, 'Alpha', 100, 'ok'),
      ('b', 'audit', 'https://www.example.com/b', 200, NULL, NULL, 'ok'),
      ('c', 'audit', 'https://www.example.com/c', 301, NULL, 300, 'ok'),
      ('d', 'audit', 'https://www.example.com/d_x', NULL, NULL, NULL, 'blocked');
    INSERT INTO audit_issues (id, audit_id, page_id, page_url, issue_type, severity) VALUES
      ('i1', 'audit', 'b', 'https://www.example.com/b', 'missing-title', 'critical'),
      ('i2', 'audit', 'a', 'https://www.example.com/a', 'thin-content', 'warning'),
      ('i3', 'audit', 'b', 'https://www.example.com/b', 'thin-content', 'warning'),
      ('i4', 'audit', 'a', 'https://www.example.com/a', 'a-note', 'info');
  `);
});

describe("AuditResultsService", () => {
  it("refuses an audit from another project", async () => {
    await expect(
      AuditResultsService.getPages(defaults, "other-project"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("summarizes the audit without listing its rows", async () => {
    const summary = await AuditResultsService.getSummary("audit", "project");

    expect(summary).toMatchObject({
      pageCount: 4,
      issueCount: 4,
      fetchClassCounts: { ok: 3, blocked: 1, rate_limited: 0, error: 0 },
      averageResponseMs: 100,
      canonicalHost: "www.example.com",
    });
    expect(summary.issueGroups).toEqual(
      expect.arrayContaining([
        { issueType: "missing-title", severity: "critical", count: 1 },
        { issueType: "thin-content", severity: "warning", count: 2 },
      ]),
    );
  });

  it("lists issues critical first, whatever their type", async () => {
    const issues = await AuditResultsService.getIssues(
      { auditId: "audit", page: 1, pageSize: 10 },
      "project",
    );
    expect(issues.map((issue) => issue.id)).toEqual(["i1", "i2", "i3", "i4"]);
  });

  it("filters, sorts blanks last in both directions, and pages in SQL", async () => {
    const urls = async (input: Partial<PagesInput>) =>
      (
        await AuditResultsService.getPages({ ...defaults, ...input }, "project")
      ).rows.map((row) => row.url.slice(-3));

    expect(await urls({ sort: "responseTimeMs", order: "desc" })).toEqual([
      "m/c",
      "m/a",
      "m/b",
      "d_x",
    ]);
    expect(await urls({ sort: "statusCode", order: "asc" })).toEqual([
      "m/a",
      "m/b",
      "m/c",
      "d_x",
    ]);
    // "_" is literal, not a LIKE wildcard.
    expect(await urls({ query: "D_X" })).toEqual(["d_x"]);
    expect(await urls({ status: "ok" })).toEqual(["m/a", "m/b"]);

    const page2 = await AuditResultsService.getPages(
      { ...defaults, page: 2, pageSize: 3 },
      "project",
    );
    expect(page2).toMatchObject({ totalCount: 4, rows: [{ id: "d" }] });

    const flagged = await AuditResultsService.getPages(defaults, "project");
    expect(
      flagged.rows.filter((row) => row.missingTitle).map((row) => row.id),
    ).toEqual(["b"]);
  });
});
