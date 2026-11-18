import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiObservations } from "@/db/schema";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { settleAiRun, type AiPostedHold } from "./aiVisibilityBilling";
import { configuration, customer } from "./aiVisibilityTestFixtures";

const { testDb, settleTrackingHold } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } = await import("../aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    settleTrackingHold: vi.fn(),
  };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ aiSearch: { settleTrackingHold } }),
}));

beforeEach(async () => {
  await testDb.seedProject();
  const rows = configuration({
    engines: ["chatgpt"],
    prompts: [{ text: "Which SEO tools?" }, { text: "Best rank tracker?" }],
  });
  await repo.saveConfiguration(rows);
  await repo.createRun(
    {
      id: "run",
      trackerId: rows.tracker.id,
      projectId: "project",
      trigger: "scheduled",
      status: "running",
      locationCode: 2840,
      languageCode: "en",
      createdAt: "2026-09-05T12:00:00.000Z",
    },
    rows.prompts.map((prompt, index) => ({
      id: `answer-${index}`,
      runId: "run",
      promptId: prompt.id,
      engine: "chatgpt",
      branded: false,
    })),
  );
});

describe("settleAiRun", () => {
  it("charges each hold only for the answers it delivered", async () => {
    await testDb.db
      .update(aiObservations)
      .set({ status: "completed" })
      .where(eq(aiObservations.id, "answer-0"));
    const hold = { lockId: "lock", featureId: "usage_credits" } as const;
    const holds = [
      {
        hold: { ...hold, estimatedCredits: 2, callIndexes: [0] },
        path: ["task_post"],
        tasks: [
          // DataForSEO's backend failed it, so it was posted again below.
          { tag: "answer-0", taskId: "first", costUsd: 0.001 },
          // Never arrives.
          { tag: "answer-1", taskId: "missing", costUsd: 0.001 },
        ],
      },
      {
        hold: { ...hold, estimatedCredits: 1, callIndexes: [0] },
        path: ["task_post"],
        tasks: [{ tag: "answer-0", taskId: "second", costUsd: 0.002 }],
      },
    ] satisfies AiPostedHold[];

    await settleAiRun("run", customer, holds);

    expect(settleTrackingHold.mock.calls).toEqual([
      [{ hold: holds[0], costs: [] }],
      [{ hold: holds[1], costs: [0.002] }],
    ]);
  });
});
