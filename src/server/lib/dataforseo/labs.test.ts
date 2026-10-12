import { afterEach, expect, it, vi } from "vitest";
import { fetchRelatedKeywords } from "./labs";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

afterEach(() => vi.unstubAllGlobals());

it("sends ignoreSynonyms to DataForSEO as ignore_synonyms", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          path: ["v3", "dataforseo_labs", "google", "related_keywords", "live"],
          cost: 0,
          result: [{ items: [] }],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await fetchRelatedKeywords({
    keyword: "caregiving",
    locationCode: 2840,
    languageCode: "en",
    limit: 150,
    ignoreSynonyms: true,
  });

  const body = fetchMock.mock.lastCall?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected JSON request body");
  expect(JSON.parse(body)).toEqual([
    expect.objectContaining({ ignore_synonyms: true }),
  ]);
});
