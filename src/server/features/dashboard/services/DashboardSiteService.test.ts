import { beforeEach, expect, it, vi } from "vitest";
import { DashboardSiteService } from "./DashboardSiteService";
import { GscService } from "@/server/features/gsc/services/GscService";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";

const providers = vi.hoisted(() => ({ domains: vi.fn(), links: vi.fn() }));
vi.mock("@/server/lib/dataforseo", async () => ({
  ...(await import("@/server/lib/dataforseoBacklinksTarget")),
  createDataforseoClient: () => ({
    backlinks: { referringDomains: providers.domains, rows: providers.links },
  }),
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: { getByProjectId: vi.fn() },
}));
vi.mock("@/server/features/gsc/services/GscService", async () => ({
  ...(await import("@/server/lib/gscErrors")),
  GscService: { getPerformance: vi.fn() },
  isExpectedGrantFailure: () => false,
}));
vi.mock("./DashboardCacheService", () => ({
  DashboardCacheService: {
    readThrough: async (input: { load: () => Promise<unknown> }) => ({
      value: await input.load(),
    }),
  },
}));

const performanceBase = {
  siteUrl: "sc-domain:example.com",
  connectedBy: null,
  request: { startDate: "2026-09-01", endDate: "2026-10-01" },
};

beforeEach(() => {
  providers.domains.mockResolvedValue({ items: [] });
  providers.links.mockResolvedValue({ items: [] });
  vi.mocked(GscConnectionRepository.getByProjectId).mockResolvedValue({
    id: "connection",
    projectId: "project",
    organizationId: "org",
    siteUrl: "sc-domain:example.com",
    connectedByUserId: "user",
    gscAccountId: "account",
    connectedAccountEmail: null,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  });
  vi.mocked(GscService.getPerformance).mockResolvedValue({
    ...performanceBase,
    rows: [],
  });
});
const row = (query: string, impressions = 10) => ({
  keys: [query],
  clicks: 0,
  impressions,
  ctr: 0,
  position: 12,
});

it("surfaces only queries above the threshold and absent from baseline data", async () => {
  vi.mocked(GscService.getPerformance)
    .mockResolvedValueOnce({
      ...performanceBase,
      rows: [row("new"), row("existing"), row("too small", 9)],
    })
    .mockResolvedValueOnce({ ...performanceBase, rows: [row("existing")] });
  const result = await DashboardSiteService.getEmergingQueries(
    "project",
    "org",
  );
  expect(result.value.rows.map((item) => item.query)).toEqual(["new"]);
});

it("checks capped baseline candidates directly so omitted older queries are not called new", async () => {
  vi.mocked(GscService.getPerformance)
    .mockResolvedValueOnce({
      ...performanceBase,
      rows: [row("older low-click query"), row("new query")],
    })
    .mockResolvedValueOnce({
      ...performanceBase,
      rows: Array.from({ length: 25000 }, (_, index) =>
        row(`baseline ${index}`),
      ),
    })
    .mockResolvedValueOnce({
      ...performanceBase,
      rows: [row("older low-click query")],
    })
    .mockResolvedValueOnce({ ...performanceBase, rows: [] });
  const result = await DashboardSiteService.getEmergingQueries(
    "project",
    "org",
  );
  expect(result.value.rows.map((item) => item.query)).toEqual(["new query"]);
});

const customer = {
  organizationId: "org",
  userId: "user",
  userEmail: "user@example.com",
};
it("shows new referring domains without paying for a fallback backlink request", async () => {
  providers.domains.mockResolvedValue({
    items: [{ domain: "new.example", backlinks: 2 }],
  });
  const result = await DashboardSiteService.getLinkActivity(
    "example.com",
    customer,
  );
  expect(result).toMatchObject({
    kind: "domains",
    value: [{ domain: "new.example", backlinks: 2 }],
  });
  expect(providers.links).not.toHaveBeenCalled();
});
it("falls back to new backlinks when there are no new referring domains", async () => {
  providers.links.mockResolvedValue({
    items: [{ url_from: "https://existing.example/new-page" }],
  });
  const result = await DashboardSiteService.getLinkActivity(
    "example.com",
    customer,
  );
  expect(result).toMatchObject({
    kind: "links",
    links: [{ urlFrom: "https://existing.example/new-page" }],
  });
});

it("finds new queries beyond Google's default first page", async () => {
  vi.mocked(GscService.getPerformance).mockImplementationOnce(
    async (input) => ({
      ...performanceBase,
      rows: input.rowLimit === 25000 ? [row("new zero-click query")] : [],
    }),
  );
  const result = await DashboardSiteService.getEmergingQueries(
    "project",
    "org",
  );
  expect(result.value.rows.map((item) => item.query)).toEqual([
    "new zero-click query",
  ]);
});

it("lists the site's Search Console keywords with Google's position, without a provider request", async () => {
  vi.mocked(GscService.getPerformance).mockResolvedValue({
    ...performanceBase,
    rows: [row("existing keyword", 123)],
  });
  const result = await DashboardSiteService.getKeywords("project", "org");
  expect(result.value.rows).toEqual([
    { query: "existing keyword", clicks: 0, impressions: 123, position: 12 },
  ]);
  expect(providers.domains).not.toHaveBeenCalled();
  expect(providers.links).not.toHaveBeenCalled();
});
