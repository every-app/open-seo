import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSerpResultsTool } from "./get-serp-results";
import { makeToolContext, textContent } from "./tool-test-support";
import type * as r2CacheModule from "@/server/lib/r2-cache";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getProjectForOrganization: vi.fn(),
  cache: new Map<string, unknown>(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: (promise: Promise<unknown>) => promise,
}));
vi.mock("@/server/lib/r2-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof r2CacheModule>()),
  getCached: async (key: string) => mocks.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, value);
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  SERP_ANALYSIS_DEPTH: 20,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

function mockLiveSerp(rows: number) {
  const live = vi.fn().mockResolvedValue(
    Array.from({ length: rows }, (_, index) => ({
      type: "organic",
      rank_absolute: index + 1,
      title: `Result ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      domain: "example.com",
      description: "desc",
    })),
  );
  mocks.createDataforseoClient.mockReturnValue({ serp: { live } });
  return live;
}

describe("get_serp_results", () => {
  beforeEach(() => {
    mocks.cache.clear();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("crawls and returns rows to the requested depth", async () => {
    const live = mockLiveSerp(40);

    const result = await getSerpResultsTool.handler(
      {
        projectId: "project_1",
        queries: [{ keyword: "seo tools" }],
        depth: 30,
      },
      toolContext,
    );

    expect(live).toHaveBeenCalledWith(expect.objectContaining({ depth: 30 }));
    // Rows are trimmed to the depth that was crawled, not the fixed top 20.
    expect(textContent(result)).toContain('"seo tools" (30 results)');
  });

  it("answers a repeated query from the saved rows without another paid call", async () => {
    const live = mockLiveSerp(20);
    const args = {
      projectId: "project_1",
      queries: [{ keyword: "seo tools" }],
    };

    const first = await getSerpResultsTool.handler(args, toolContext);
    const repeat = await getSerpResultsTool.handler(args, toolContext);

    expect(live).toHaveBeenCalledTimes(1);
    expect(repeat.structuredContent).toEqual(first.structuredContent);
  });
});
