import { afterEach, expect, it, vi } from "vitest";
import { fetchKeywordSuggestions, fetchRelatedKeywords } from "./labs";

vi.mock("@/server/lib/runtime-env", () => ({
  // AUTH_MODE unset: the deployment holds the DataForSEO key.
  getOptionalEnvValue: vi.fn(async () => undefined),
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

afterEach(() => vi.unstubAllGlobals());

const market = { locationCode: 2840, languageCode: "en", limit: 150 };

/** Answers the next DataForSEO call with one successful task. */
function stubTask(result: unknown) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          path: ["v3", "dataforseo_labs"],
          cost: 0,
          result: [result],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The tasks the call posted to DataForSEO. */
function sentTasks(fetchMock: ReturnType<typeof stubTask>): unknown {
  const body = fetchMock.mock.lastCall?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected JSON request body");
  return JSON.parse(body);
}

it("sends ignoreSynonyms to DataForSEO as ignore_synonyms", async () => {
  const fetchMock = stubTask({ items: [] });

  await fetchRelatedKeywords({
    keyword: "caregiving",
    ...market,
    ignoreSynonyms: true,
  });

  expect(sentTasks(fetchMock)).toEqual([
    expect.objectContaining({ ignore_synonyms: true }),
  ]);
});

it("returns the searched keyword's own data as the first suggestion", async () => {
  stubTask({
    seed_keyword_data: { keyword: "mobile detailing" },
    items: [{ keyword: "mobile detailing near me" }],
  });

  const { data } = await fetchKeywordSuggestions({
    keyword: "mobile detailing",
    ...market,
  });

  expect(data.map((item) => item.keyword)).toEqual([
    "mobile detailing",
    "mobile detailing near me",
  ]);
});

it("does not ask for the searched keyword's data on a filtered call, where DataForSEO would return it unfiltered", async () => {
  const fetchMock = stubTask({ items: [] });

  await fetchKeywordSuggestions({
    keyword: "for dogs",
    ...market,
    filters: ["keyword", "like", "best % for dogs"],
  });

  expect(sentTasks(fetchMock)).toEqual([
    expect.objectContaining({ include_seed_keyword: false }),
  ]);
});
