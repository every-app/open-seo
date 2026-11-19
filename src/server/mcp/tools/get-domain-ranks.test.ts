import { describe, expect, it, vi } from "vitest";
import { getDomainRanksTool } from "./get-domain-ranks";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  bulkRanks: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    backlinks: { bulkRanks: mocks.bulkRanks },
  }),
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

describe("get_domain_ranks", () => {
  it("ranks each domain once in one call, with null for a domain DataForSEO has no rank for", async () => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.bulkRanks.mockResolvedValue([{ target: "example.com", rank: 91 }]);

    const result = await getDomainRanksTool.handler(
      {
        projectId: "project_1",
        domains: ["https://www.example.com/blog", "example.com", "new-site.io"],
      },
      makeToolContext(),
    );

    expect(mocks.bulkRanks).toHaveBeenCalledWith({
      targets: ["example.com", "new-site.io"],
    });
    expect(result.structuredContent).toMatchObject({
      ranks: [
        { domain: "example.com", rank: 91 },
        { domain: "new-site.io", rank: null },
      ],
    });
  });
});
