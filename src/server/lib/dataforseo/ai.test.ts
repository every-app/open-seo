import { expect, it, vi } from "vitest";
import { fetchLlmResponse } from "@/server/lib/dataforseo/ai";

vi.mock("@/server/lib/runtime-env", () => ({
  // AUTH_MODE unset: the deployment holds the DataForSEO key.
  getOptionalEnvValue: vi.fn(async () => undefined),
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));
vi.mock("@/server/lib/dataforseo/llm-models", () => ({
  isKnownLlmModelName: async () => true,
}));

it("never replays a billed llm_responses call on a 5xx (a retry could double-charge)", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("upstream error", { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    fetchLlmResponse({
      modelSlug: "claude",
      modelName: "claude-sonnet-5",
      userPrompt: "Which SEO tools?",
      webSearch: false,
    }),
  ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
