import { afterEach, expect, it, vi } from "vitest";
import { fetchAdsKeywordIdeas, fetchAdsSearchVolume } from "./google-ads";

vi.mock("@/server/lib/runtime-env", () => ({
  // AUTH_MODE unset: the deployment holds the DataForSEO key.
  getOptionalEnvValue: vi.fn(async () => undefined),
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

afterEach(() => vi.unstubAllGlobals());

function stubAdsFetch() {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          path: ["v3", "keywords_data", "google_ads", "search_volume", "live"],
          cost: 0,
          result: [],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentTasks(fetchMock: ReturnType<typeof stubAdsFetch>): unknown {
  const body = fetchMock.mock.lastCall?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected JSON request body");
  return JSON.parse(body);
}

function expectLanguageCode(
  fetchMock: ReturnType<typeof stubAdsFetch>,
  languageCode: string,
) {
  expect(sentTasks(fetchMock)).toEqual([
    expect.objectContaining({ language_code: languageCode }),
  ]);
}

it("sends Norwegian Bokmål to Google Ads as no", async () => {
  const fetchMock = stubAdsFetch();

  await fetchAdsSearchVolume({
    keywords: ["hotell oslo"],
    locationCode: 2578,
    languageCode: "nb",
    locationName: "Oslo,Oslo,Norway",
  });
  expectLanguageCode(fetchMock, "no");

  await fetchAdsKeywordIdeas({
    keyword: "hotell oslo",
    locationCode: 2578,
    languageCode: "nb",
    limit: 10,
  });
  expectLanguageCode(fetchMock, "no");
});

it.each([
  ["he", "iw"],
  ["zh-TW", "zh_TW"],
  ["zh-CN", "zh_CN"],
])("sends %s to Google Ads as %s", async (languageCode, adsCode) => {
  const fetchMock = stubAdsFetch();

  await fetchAdsSearchVolume({
    keywords: ["hotel"],
    locationCode: 2344,
    languageCode,
  });
  expectLanguageCode(fetchMock, adsCode);
});

it("sends no language for one Google Ads does not have", async () => {
  const fetchMock = stubAdsFetch();

  // Albanian: Google Ads fails the whole task on language_code "sq".
  await fetchAdsSearchVolume({
    keywords: ["hotel tirana"],
    locationCode: 2008,
    languageCode: "sq",
    locationName: "Tirana County,Albania",
  });
  expect(sentTasks(fetchMock)).toEqual([
    { keywords: ["hotel tirana"], location_name: "Tirana County,Albania" },
  ]);
});
