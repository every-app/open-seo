import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  listProjects: vi.fn(),
  listArchivedProjects: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: { events: { aggregate: mocks.aggregate } },
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    listProjects: mocks.listProjects,
    listArchivedProjects: mocks.listArchivedProjects,
  },
}));

import { getOrganizationBillingUsage } from "./usage";

const total = {
  usage_credits: { count: 4, sum: 300 },
  topup_credits: { count: 2, sum: 200 },
};

function grouped(
  usage_credits: Record<string, number>,
  topup_credits: Record<string, number>,
) {
  return {
    list: [
      {
        period: 1,
        values: {},
        groupedValues: { usage_credits, topup_credits },
      },
    ],
    total,
  };
}

beforeEach(() => {
  mocks.listProjects.mockResolvedValue([{ id: "p_live", name: "Live site" }]);
  mocks.listArchivedProjects.mockResolvedValue([
    { id: "p_old", name: "Old site" },
  ]);
  mocks.aggregate.mockImplementation(async ({ groupBy }) => {
    if (groupBy === "properties.creditFeature") {
      return grouped(
        { site_audit: 250, retired: 50, backlinks: -10 },
        { site_audit: 100 },
      );
    }
    if (groupBy === "properties.projectId") {
      return grouped({ p_live: 200, p_foreign: 20 }, { p_old: 100 });
    }
    return {
      list: [
        { period: 1, values: { usage_credits: 300, topup_credits: 200 } },
        { period: 2, values: { usage_credits: 0, topup_credits: 0 } },
      ],
      total: {},
    };
  });
});

describe("getOrganizationBillingUsage", () => {
  it("totals both balances by day, by feature and by project", async () => {
    await expect(
      getOrganizationBillingUsage("org_1", "America/New_York"),
    ).resolves.toEqual({
      days: [
        { date: 1, usd: 0.5 },
        { date: 2, usd: 0 },
      ],
      // Other: 110 credits Autumn left ungrouped plus 50 of an unknown
      // feature. Backlinks nets below zero after a refund and is hidden.
      features: [
        { label: "Site Audit", usd: 0.35 },
        { label: "Other", usd: 0.16 },
      ],
      // Usage with no project is Workspace; a project id outside the
      // organization is never named.
      projects: [
        { label: "Live site", usd: 0.2 },
        { label: "Workspace", usd: 0.18 },
        { label: "Old site (archived)", usd: 0.1 },
        { label: "Other", usd: 0.02 },
      ],
    });
  });
});
