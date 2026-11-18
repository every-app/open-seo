import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { aiObservations } from "@/db/schema";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { AI_ANSWER_FAILURES } from "./aiVisibilityErrors";
import { finalizeAiRun } from "./aiVisibilityRunOutcome";
import { configuration } from "./aiVisibilityTestFixtures";

const { testDb } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } = await import("../aiVisibilityTestDb");
  return { testDb: await createAiVisibilityTestDb() };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));

const runId = "run";

beforeEach(async () => {
  await testDb.seedProject();
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
      trigger: "scheduled",
      status: "running",
      locationCode: 2840,
      languageCode: "en",
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

describe("AI run outcome", () => {
  it("fails answers that never arrived and finishes the run as partial", async () => {
    await testDb.db
      .update(aiObservations)
      .set({ status: "completed" })
      .where(eq(aiObservations.id, "answer-0"));

    await finalizeAiRun(runId);

    expect(await repo.getRunInternal(runId)).toMatchObject({
      status: "partial",
    });
    expect(await repo.getObservation("answer-1")).toMatchObject({
      status: "failed",
      error: AI_ANSWER_FAILURES.notArrived,
    });
    expect((await repo.getTracker("project"))?.lastSkipReason).toBe(
      AI_ANSWER_FAILURES.notCollected,
    );
  });
});
