import { describe, expect, it, vi } from "vitest";
import { postAiTrackingTasks } from "@/server/lib/dataforseo/ai-tracking";

vi.mock("@/server/lib/runtime-env", () => ({
  // AUTH_MODE unset: the deployment holds the DataForSEO key.
  getOptionalEnvValue: vi.fn(async () => undefined),
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

describe("AI tracking requests", () => {
  it("queues a Google AI Mode prompt on the AI Mode endpoint, in a language it lists", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-1",
            status_code: 20100,
            cost: 0.0012,
            data: { tag: "answer-1" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await postAiTrackingTasks({
      engine: "google_ai_mode",
      // Portugal. AI Mode rejects the project market's "pt".
      locationCode: 2620,
      languageCode: "pt",
      tasks: [{ tag: "answer-1", prompt: "Which SEO tools?" }],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.dataforseo.com/v3/serp/google/ai_mode/task_post",
    );
    const body = init?.body;
    if (typeof body !== "string") throw new Error("Expected a JSON body");
    const tasks: unknown = JSON.parse(body);
    // No depth or async overview load: those belong to the organic SERP.
    expect(tasks).toEqual([
      {
        keyword: "Which SEO tools?",
        location_code: 2620,
        language_code: "pt-BR",
        tag: "answer-1",
      },
    ]);
  });
});
