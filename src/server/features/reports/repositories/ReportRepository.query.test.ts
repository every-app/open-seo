import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as ReportRepositoryModule from "./ReportRepository";
import type * as ReportServiceModule from "../services/ReportService";

const mocks = vi.hoisted(() => ({ captureServerEvent: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

let client: Client;
let ReportRepository: typeof ReportRepositoryModule.ReportRepository;
let ReportService: typeof ReportServiceModule.ReportService;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // Load the real repository and service after installing the runtime database.
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(`
    CREATE TABLE reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      html TEXT NOT NULL,
      skill TEXT,
      template_id TEXT,
      created_by TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      share_token TEXT UNIQUE,
      shared_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ({ ReportRepository } = await import("./ReportRepository"));
  ({ ReportService } = await import("../services/ReportService"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.execute("DELETE FROM reports");
  await ReportRepository.insertReport({
    id: "report_1",
    projectId: "project_1",
    title: "SEO audit",
    summary: "One clear verdict.",
    html: "<html><body>Report</body></html>",
    skill: "seo-audit",
    templateId: null,
    createdBy: "Codex",
    createdByUserId: "user_1",
    sizeBytes: 32,
  });
});

describe("report sharing persistence", () => {
  it("returns the same persisted link when two publishers both read a private report", async () => {
    const getReport = ReportRepository.getReport;
    let releaseReads!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    let initialReads = 0;
    vi.spyOn(ReportRepository, "getReport").mockImplementation(
      async (projectId, reportId) => {
        const report = await getReport(projectId, reportId);
        if (initialReads < 2) {
          expect(report?.shareToken).toBeNull();
          initialReads += 1;
          if (initialReads === 2) releaseReads();
          await bothRead;
        }
        return report;
      },
    );
    const params = {
      projectId: "project_1",
      reportId: "report_1",
      userId: "user_1",
      organizationId: "org_1",
      source: "mcp" as const,
    };

    const published = await Promise.all([
      ReportService.shareReport(params),
      ReportService.shareReport(params),
    ]);
    const stored = await getReport(params.projectId, params.reportId);

    expect(initialReads).toBe(2);
    expect(stored?.shareToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    for (const report of published) {
      expect(report.shareToken).toBe(stored?.shareToken);
      expect(report.sharedAt).toBe(stored?.sharedAt);
    }
    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report:shared" }),
    );
  });

  it("preserves the winning token until revocation permits a new one", async () => {
    const first = {
      shareToken: "a".repeat(32),
      sharedAt: "2026-09-20T10:00:00.000Z",
    };
    const second = {
      shareToken: "b".repeat(32),
      sharedAt: "2026-09-20T11:00:00.000Z",
    };

    await expect(
      ReportRepository.setShareToken("project_1", "report_1", first),
    ).resolves.toBe(true);
    await expect(
      ReportRepository.setShareToken("project_1", "report_1", second),
    ).resolves.toBe(false);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject(first);

    await expect(
      ReportRepository.setShareToken("project_1", "report_1", null),
    ).resolves.toBe(true);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject({ shareToken: null, sharedAt: null });
    await expect(
      ReportRepository.setShareToken("project_1", "report_1", second),
    ).resolves.toBe(true);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject(second);
  });

  it.each([
    ["foreign_project", "report_1"],
    ["project_1", "missing_report"],
  ])("refuses sharing mutations for %s / %s", async (projectId, reportId) => {
    const share = {
      shareToken: "a".repeat(32),
      sharedAt: "2026-09-20T10:00:00.000Z",
    };
    await expect(
      ReportRepository.setShareToken(projectId, reportId, share),
    ).resolves.toBe(false);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject({ shareToken: null, sharedAt: null });

    await ReportRepository.setShareToken("project_1", "report_1", share);
    await expect(
      ReportRepository.setShareToken(projectId, reportId, null),
    ).resolves.toBe(false);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject(share);
  });
});
