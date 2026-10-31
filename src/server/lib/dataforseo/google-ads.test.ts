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

function expectLanguageCode(
  fetchMock: ReturnType<typeof stubAdsFetch>,
  languageCode: string,
) {
  const body = fetchMock.mock.lastCall?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected JSON request body");
  expect(JSON.parse(body)).toEqual([
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

it("sends other language codes to Google Ads unchanged", async () => {
  const fetchMock = stubAdsFetch();

  await fetchAdsSearchVolume({
    keywords: ["hotel"],
    locationCode: 2840,
    languageCode: "en",
  });
  expectLanguageCode(fetchMock, "en");

  await fetchAdsKeywordIdeas({
    keyword: "hotel",
    locationCode: 2840,
    languageCode: "en",
    limit: 10,
  });
  expectLanguageCode(fetchMock, "en");
});
