import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

import { globalSearchVolumeTool } from "./global-search-volume";

const toolContext = makeToolContext();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({
    id: "project_1",
    locationCode: 2840,
    languageCode: "en",
  });
});

describe("global_search_volume MCP tool", () => {
  it("returns worldwide volume and a bounded top-country distribution", async () => {
    const globalSearchVolume = vi.fn().mockResolvedValue([
      {
        keyword: "best hiking trails in the world",
        searchVolume: 8800,
        countryDistribution: [
          { countryIsoCode: "US", searchVolume: 1900, percentage: 21.5909 },
          { countryIsoCode: "DE", searchVolume: 1200, percentage: 13.6363 },
        ],
      },
    ]);
    mocks.createDataforseoClient.mockReturnValue({
      keywords: { globalSearchVolume },
    });

    const result = await globalSearchVolumeTool.handler(
      {
        projectId: "project_1",
        keywords: ["best hiking trails in the world"],
        maxCountries: 1,
      },
      toolContext,
    );

    expect(globalSearchVolume).toHaveBeenCalledWith({
      keywords: ["best hiking trails in the world"],
      creditFeature: "keyword_research",
    });
    expect(result.structuredContent).toMatchObject({
      scope: "worldwide",
      source: "dataforseo_clickstream_global_search_volume",
      rows: [
        {
          keyword: "best hiking trails in the world",
          searchVolume: 8800,
          countryDistribution: [
            { countryIsoCode: "US", searchVolume: 1900, percentage: 21.5909 },
          ],
          countryDistributionTotal: 2,
          countryDistributionTruncated: true,
        },
      ],
    });
    expect(result.structuredContent).toHaveProperty("meta");
    expect(textContent(result)).toContain(
      "keyword | global volume | top countries",
    );
    expect(textContent(result)).toContain(
      "best hiking trails in the world | 8800 | US 1900 (21.59%)",
    );
  });

  it("allows up to 1000 provider keywords but rejects a larger batch", () => {
    const schema = globalSearchVolumeTool.config.inputSchema;
    expect(
      schema.keywords.safeParse(Array.from({ length: 1000 }, () => "trail"))
        .success,
    ).toBe(true);
    expect(
      schema.keywords.safeParse(Array.from({ length: 1001 }, () => "trail"))
        .success,
    ).toBe(false);
  });
});
