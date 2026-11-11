import { expect, it, vi } from "vitest";
import { postRankCheckTasks } from "@/server/lib/dataforseo/serp";

vi.mock("@/server/lib/runtime-env", () => ({
  // AUTH_MODE unset: the deployment holds the DataForSEO key.
  getOptionalEnvValue: vi.fn(async () => undefined),
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

it("never replays a rank check post on a 5xx (a retry could double-charge)", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("upstream error", { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    postRankCheckTasks({
      tasks: [{ keyword: "alpha", keywordId: "kw-1", device: "desktop" }],
      locationCode: 2840,
      languageCode: "en",
      depth: 10,
    }),
  ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
