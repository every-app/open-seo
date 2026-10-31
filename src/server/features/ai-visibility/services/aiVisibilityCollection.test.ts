import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiObservations, projectCompetitors } from "@/db/schema";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import {
  collectAiLiveBatch,
  collectAiModelBatch,
  collectAiRound,
  collectLateAiAnswers,
  postAiBatch,
  prepareAiRun,
} from "./aiVisibilityCollection";
import { finalizeAiRun } from "./aiVisibilityRunOutcome";
import { configuration, customer } from "./aiVisibilityTestFixtures";

const { testDb, dataforseo } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } = await import("../aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    dataforseo: {
      trackingTaskPost: vi.fn(),
      trackingLiveBatch: vi.fn(),
      fetchTaskResult: vi.fn(),
      llmResponse: vi.fn(),
    },
  };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class extends Error {},
}));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  MAX_TASKS_PER_POST: 100,
  createDataforseoClient: () => ({
    aiSearch: {
      trackingTaskPost: dataforseo.trackingTaskPost,
      trackingLiveBatch: dataforseo.trackingLiveBatch,
      llmResponse: dataforseo.llmResponse,
    },
  }),
  fetchAiTrackingTaskResult: dataforseo.fetchTaskResult,
}));
vi.mock("@/server/lib/dataforseo/llm-models", () => ({
  resolveLatestLlmModelName: async () => "claude-sonnet-5",
}));

const runId = "run";
const market = { locationCode: 2840, languageCode: "en" };
const pendingTask = {
  tag: "answer-0",
  taskId: "task",
  costUsd: 0.002,
  engine: "chatgpt",
  prompt: "Which SEO tools?",
  attempts: 1,
} as const;
const liveAnswer = {
  status: "fulfilled",
  value: { status: "completed", result: { markdown: "OpenSEO", sources: [] } },
} as const;
const providerFailure = {
  status: "failed",
  message: "Internal Server Error.",
  code: "UPSTREAM_UNAVAILABLE",
  retryable: true,
} as const;

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  await testDb.seedProject();
  await testDb.db.insert(projectCompetitors).values({
    id: "competitor",
    projectId: "project",
    domain: "ahrefs.com",
    name: "Ahrefs",
    updatedBy: "user",
  });
  const rows = configuration({
    engines: ["chatgpt"],
    prompts: [{ text: "Which SEO tools?" }, { text: "Best rank tracker?" }],
  });
  await repo.saveConfiguration(rows);
  await repo.createRun(
    {
      id: runId,
      trackerId: rows.tracker.id,
      projectId: "project",
      trigger: "manual",
      status: "running",
      ...market,
      createdAt: "2026-09-05T12:00:00.000Z",
    },
    rows.prompts.map((prompt, index) => ({
      id: `answer-${index}`,
      runId,
      promptId: prompt.id,
      engine: "chatgpt",
      branded: false,
    })),
  );
});

describe("AI answer collection", () => {
  it("saves an answer with its citations and each brand's mention and citation", async () => {
    dataforseo.fetchTaskResult.mockResolvedValue({
      status: "completed",
      result: {
        markdown:
          "Try **Ahrefs** or OpenSEO [1](https://openseo.so/pricing?utm_source=chatgpt)",
        sources: [
          {
            url: "https://openseo.so/pricing?utm_source=chatgpt",
            title: "Pricing",
          },
        ],
      },
    });

    const round = await collectAiRound(runId, [pendingTask], true);

    expect(round).toEqual({ pending: [], retry: [] });
    expect(await repo.getObservation("answer-0")).toMatchObject({
      status: "completed",
    });
    const evidence = await repo.getEvidence(["answer-0"]);
    expect(evidence.sources).toMatchObject([
      { url: "https://openseo.so/pricing", domain: "openseo.so", position: 1 },
    ]);
    expect(evidence.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "openseo.so",
          own: true,
          mentioned: true,
          cited: true,
          firstMention: 14,
        }),
        expect.objectContaining({
          domain: "ahrefs.com",
          own: false,
          mentioned: true,
          cited: false,
          firstMention: 4,
        }),
      ]),
    );
    // A retried step skips the answer an earlier attempt already saved.
    await collectAiRound(runId, [pendingTask], true);
    expect(dataforseo.fetchTaskResult).toHaveBeenCalledTimes(1);
  });

  it("fails the answers DataForSEO did not accept and collects the rest", async () => {
    dataforseo.trackingTaskPost.mockResolvedValue({
      tasks: [{ tag: "answer-0", taskId: "task", costUsd: 0.002 }],
      hold: null,
    });

    const { pending } = await postAiBatch(runId, customer, market, {
      engine: "chatgpt",
      tasks: [
        { tag: "answer-0", prompt: "Which SEO tools?" },
        { tag: "answer-1", prompt: "Best rank tracker?" },
      ],
    });

    expect(pending).toEqual([pendingTask]);
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "failed",
    });
  });

  it("counts the attempt of an answer posted again, so its retries stop at 3", async () => {
    dataforseo.trackingTaskPost.mockResolvedValue({
      tasks: [{ tag: "answer-0", taskId: "task", costUsd: 0.002 }],
      hold: null,
    });

    const { pending } = await postAiBatch(runId, customer, market, {
      engine: "chatgpt",
      tasks: [{ tag: "answer-0", prompt: "Which SEO tools?", attempts: 2 }],
    });

    expect(pending).toEqual([{ ...pendingTask, attempts: 3 }]);
  });

  it("returns a queued answer DataForSEO's backend failed for a new post, and fails it after the last attempt", async () => {
    dataforseo.fetchTaskResult.mockResolvedValue(providerFailure);

    const round = await collectAiRound(
      runId,
      [
        pendingTask,
        {
          ...pendingTask,
          tag: "answer-1",
          prompt: "Best rank tracker?",
          attempts: 3,
        },
      ],
      true,
    );

    expect(round.retry).toEqual([
      {
        engine: "chatgpt",
        tasks: [{ tag: "answer-0", prompt: "Which SEO tools?", attempts: 1 }],
      },
    ]);
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "failed",
      error: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("saves each model answer without waiting for slower calls", async () => {
    dataforseo.llmResponse.mockImplementation(
      ({ userPrompt }: { userPrompt: string }) =>
        userPrompt === "Best rank tracker?"
          ? new Promise(() => {})
          : Promise.resolve({ items: [] }),
    );

    void collectAiModelBatch(runId, customer, market, {
      engine: "claude",
      tasks: [
        { tag: "answer-0", prompt: "Which SEO tools?" },
        { tag: "answer-1", prompt: "Best rank tracker?" },
      ],
    });

    await vi.waitFor(async () =>
      expect(await repo.getObservation("answer-0")).toMatchObject({
        status: "completed",
      }),
    );
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "pending",
    });
  });

  it("saves model answers with their cited pages and fails the calls that error", async () => {
    dataforseo.llmResponse.mockImplementation(
      async ({ userPrompt }: { userPrompt: string }) => {
        if (userPrompt === "Best rank tracker?") throw new Error("Timed out");
        return {
          items: [
            {
              type: "message",
              sections: [
                {
                  text: "Try OpenSEO.",
                  annotations: [
                    { url: "https://openseo.so/", title: "OpenSEO" },
                  ],
                },
              ],
            },
          ],
        };
      },
    );

    await collectAiModelBatch(runId, customer, market, {
      engine: "claude",
      tasks: [
        { tag: "answer-0", prompt: "Which SEO tools?" },
        { tag: "answer-1", prompt: "Best rank tracker?" },
      ],
    });

    expect(dataforseo.llmResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        modelSlug: "claude",
        webSearch: true,
        webSearchCountryCode: "US",
      }),
    );
    expect(await repo.getObservation("answer-0")).toMatchObject({
      status: "completed",
      answerMarkdown: "Try OpenSEO.",
    });
    expect((await repo.getEvidence(["answer-0"])).sources).toMatchObject([
      { url: "https://openseo.so/", domain: "openseo.so" },
    ]);
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "failed",
      error: "INTERNAL_ERROR",
    });
  });

  it("asks a model answer again only when DataForSEO returned the failed task", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    dataforseo.llmResponse.mockImplementation(
      async ({ userPrompt }: { userPrompt: string }) => {
        if (userPrompt === "Best rank tracker?")
          throw new AppError("UPSTREAM_UNAVAILABLE", "DataForSEO HTTP 502");
        throw new DataforseoChargedTaskError(
          "Internal Server Error.",
          { path: [], costUsd: 0 },
          false,
          "UPSTREAM_UNAVAILABLE",
        );
      },
    );

    const collecting = collectAiModelBatch(runId, customer, market, {
      engine: "claude",
      tasks: [
        { tag: "answer-0", prompt: "Which SEO tools?" },
        { tag: "answer-1", prompt: "Best rank tracker?" },
      ],
    });
    await vi.runAllTimersAsync();
    await collecting;

    expect(dataforseo.llmResponse).toHaveBeenCalledTimes(4);
    expect(await repo.getObservation("answer-0")).toMatchObject({
      status: "failed",
      error: "UPSTREAM_UNAVAILABLE",
    });
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "failed",
      error: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("sends Claude to the model API, not the live scraper, on a manual run", async () => {
    const [{ promptId }] = await repo.getObservations([runId]);
    await testDb.db.insert(aiObservations).values({
      id: "answer-claude",
      runId,
      promptId,
      engine: "claude",
      branded: false,
    });

    const plan = await prepareAiRun(runId);

    expect(plan.modelBatches).toMatchObject([
      { engine: "claude", tasks: [{ tag: "answer-claude" }] },
    ]);
    expect(plan.batches.flat()).not.toContainEqual(
      expect.objectContaining({ engine: "claude" }),
    );
  });

  it("collects a manual run live, saving answers and failing rejected calls", async () => {
    expect(await prepareAiRun(runId)).toMatchObject({ live: true });
    dataforseo.trackingLiveBatch.mockResolvedValue([
      liveAnswer,
      { status: "rejected", reason: new Error("Timed out") },
    ]);

    await collectAiLiveBatch(runId, customer, market, [
      { tag: "answer-0", prompt: "Which SEO tools?", engine: "chatgpt" },
      { tag: "answer-1", prompt: "Best rank tracker?", engine: "chatgpt" },
    ]);

    expect(await repo.getObservation("answer-0")).toMatchObject({
      status: "completed",
    });
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "failed",
      error: "INTERNAL_ERROR",
    });
    expect(dataforseo.trackingLiveBatch).toHaveBeenCalledOnce();
  });

  it("asks a live answer again when DataForSEO's backend fails it, up to 3 attempts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const failed = { status: "fulfilled", value: providerFailure };
    dataforseo.trackingLiveBatch
      .mockResolvedValueOnce([failed, failed])
      .mockResolvedValueOnce([liveAnswer, failed])
      .mockResolvedValueOnce([failed]);

    const collecting = collectAiLiveBatch(runId, customer, market, [
      { tag: "answer-0", prompt: "Which SEO tools?", engine: "chatgpt" },
      { tag: "answer-1", prompt: "Best rank tracker?", engine: "chatgpt" },
    ]);
    await vi.runAllTimersAsync();
    await collecting;

    expect(dataforseo.trackingLiveBatch).toHaveBeenCalledTimes(3);
    expect(await repo.getObservation("answer-0")).toMatchObject({
      status: "completed",
    });
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "failed",
      error: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("saves the rest of a paid live batch when one answer cannot be saved", async () => {
    dataforseo.trackingLiveBatch.mockResolvedValue([liveAnswer, liveAnswer]);
    vi.spyOn(repo, "persistAnswer").mockRejectedValueOnce(new Error("D1"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await collectAiLiveBatch(runId, customer, market, [
      { tag: "answer-0", prompt: "Which SEO tools?", engine: "chatgpt" },
      { tag: "answer-1", prompt: "Best rank tracker?", engine: "chatgpt" },
    ]);

    expect(await repo.getObservation("answer-0")).toMatchObject({
      status: "pending",
    });
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "completed",
    });
  });

  it("fills in an answer that arrives after the run finished, and clears the notice", async () => {
    dataforseo.fetchTaskResult.mockResolvedValue(liveAnswer.value);
    await collectAiRound(runId, [pendingTask], true);
    await finalizeAiRun(runId);

    const late = { ...pendingTask, tag: "answer-1" };
    expect(await collectLateAiAnswers(runId, [late])).toEqual([]);

    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "completed",
      error: null,
    });
    expect(await repo.getRunInternal(runId)).toMatchObject({
      status: "completed",
    });
    expect((await repo.getTracker("project"))?.lastSkipReason).toBeNull();
  });
});
