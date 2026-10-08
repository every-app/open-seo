import { beforeEach, expect, it, vi } from "vitest";

const { summary, history, normalizeTarget } = vi.hoisted(() => ({
  summary: vi.fn(),
  history: vi.fn(),
  normalizeTarget: vi.fn(() => ({
    apiTarget: "blog.example.com",
    displayTarget: "blog.example.com",
    scope: "subdomains" as "domain" | "subdomains",
    includeSubdomains: true,
    path: "",
  })),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(() => ({ backlinks: { summary, history } })),
  normalizeBacklinksTarget: normalizeTarget,
}));

import { profileBacklinksOverview } from "./backlinksServiceData";

const billingCustomer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "team@example.com",
};
const summaryResult = {
  rank: 42,
  backlinks: 1200,
  referring_pages: 900,
  referring_domains: 320,
  broken_backlinks: 12,
  broken_pages: 3,
  backlinks_spam_score: 5,
  info: { target_spam_score: 4 },
  new_backlinks: 25,
  lost_backlinks: 10,
  new_referring_domains: 8,
  lost_referring_domains: 2,
};

function createCache() {
  const values = new Map<string, unknown>();
  return {
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

beforeEach(() => vi.clearAllMocks());

it("keeps a subdomain summary when backlink history is unavailable", async () => {
  summary.mockResolvedValue(summaryResult);
  history.mockRejectedValue(
    new Error("Backlink history is unavailable for this target"),
  );
  const cache = createCache();
  const input = {
    target: "https://blog.example.com/articles/latest",
    scope: "subdomains",
  } as const;

  const first = await profileBacklinksOverview(
    cache,
    "overview-key",
    input,
    billingCustomer,
  );
  const second = await profileBacklinksOverview(
    cache,
    "overview-key",
    input,
    billingCustomer,
  );

  expect(first.overview.summary).toEqual(
    expect.objectContaining({
      backlinks: 1200,
      referringDomains: 320,
      rank: 42,
    }),
  );
  expect(first.overview.trends).toEqual([]);
  expect(first.overview.newLostTrends).toEqual([]);
  expect(second).toEqual(first);
  expect(summary).toHaveBeenCalledOnce();
  expect(history).not.toHaveBeenCalled();
});

it("still rejects the overview when the summary is unavailable", async () => {
  const summaryError = new Error("Backlink summary is unavailable");
  summary.mockRejectedValue(summaryError);
  history.mockResolvedValue([]);

  await expect(
    profileBacklinksOverview(
      createCache(),
      "overview-key",
      { target: "blog.example.com", scope: "subdomains" },
      billingCustomer,
    ),
  ).rejects.toBe(summaryError);
});

it("still rejects root-domain overviews when history is unavailable", async () => {
  normalizeTarget.mockReturnValueOnce({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
    includeSubdomains: false,
    path: "",
  });
  summary.mockResolvedValue(summaryResult);
  const historyError = new Error("Backlink history is unavailable");
  history.mockRejectedValue(historyError);
  const cache = createCache();

  await expect(
    profileBacklinksOverview(
      cache,
      "overview-key",
      { target: "example.com" },
      billingCustomer,
    ),
  ).rejects.toBe(historyError);
  await expect(cache.get("overview-key")).resolves.toBeUndefined();
});
