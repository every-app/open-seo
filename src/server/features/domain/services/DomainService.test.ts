import { expect, it, vi } from "vitest";
import { DomainService } from "./DomainService";

const mocks = vi.hoisted(() => ({
  cache: new Map<string, string>(),
  rankOverview: vi.fn(),
  rankedKeywords: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  waitUntil: () => {},
  env: {
    R2: {
      get: async (key: string) => {
        const value = mocks.cache.get(key);
        return value === undefined ? null : { text: async () => value };
      },
      put: async (key: string, value: string) => mocks.cache.set(key, value),
    },
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    domain: {
      rankOverview: mocks.rankOverview,
      rankedKeywords: mocks.rankedKeywords,
    },
  }),
}));

const customer = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "user@example.com",
};
const input = {
  projectId: "project_1",
  organizationId: "org_1",
  domain: "new-site.com",
  locationCode: 2840,
  languageCode: "en",
};

it("serves a domain with no data from the cache instead of paying again", async () => {
  mocks.rankOverview.mockResolvedValue([]);
  mocks.rankedKeywords.mockResolvedValue({ items: [] });

  for (let visit = 0; visit < 2; visit++) {
    await DomainService.getOverview(input, customer);
    await DomainService.getSuggestedKeywords(input, customer);
  }

  expect(mocks.rankOverview).toHaveBeenCalledTimes(1);
  expect(mocks.rankedKeywords).toHaveBeenCalledTimes(1);
});
