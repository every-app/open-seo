import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiObservations, aiRuns } from "@/db/schema";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { runCheck } from "./aiVisibilityRuns";
import { getTracker } from "./aiVisibilityState";
import { configuration, customer } from "./aiVisibilityTestFixtures";

const { testDb, workflow } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } = await import("../aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    workflow: { create: vi.fn(), get: vi.fn() },
  };
});
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1", AI_VISIBILITY_WORKFLOW: workflow },
}));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "dataforseo-key",
  isHostedServerAuthMode: async () => false,
}));

const projectId = "project";
const workflowStatus = (status: string) =>
  workflow.get.mockResolvedValue({ status: async () => ({ status }) });

beforeEach(async () => {
  await testDb.seedProject();
  await repo.saveConfiguration(
    configuration({
      engines: ["chatgpt"],
      prompts: [{ text: "Which SEO tools?" }, { text: "Is OpenSEO good?" }],
    }),
  );
  workflowStatus("running");
});

describe("AI visibility checks", () => {
  it("runs one check at a time and points a second start at the running one", async () => {
    const run = await runCheck({ projectId, maxCostUsd: 1 }, customer);
    expect(run).toMatchObject({ status: "queued", expected: 2, pending: 2 });
    expect(workflow.create).toHaveBeenCalledWith({
      id: run.id,
      params: { runId: run.id, customer: { ...customer, projectId } },
    });
    await expect(
      runCheck({ projectId, maxCostUsd: 1 }, customer),
    ).rejects.toMatchObject({ reason: "RUN_IN_PROGRESS", runId: run.id });
    expect(workflow.create).toHaveBeenCalledOnce();
  });

  it("fails a check whose workflow stopped, so it never blocks the next one", async () => {
    const stuck = await runCheck({ projectId, maxCostUsd: 1 }, customer);
    await testDb.db
      .update(aiRuns)
      .set({ status: "running", createdAt: "2026-01-01T00:00:00.000Z" });
    workflowStatus("errored");

    const next = await runCheck({ projectId, maxCostUsd: 1 }, customer);

    expect(next.id).not.toBe(stuck.id);
    expect(await repo.getRunInternal(stuck.id)).toMatchObject({
      status: "failed",
    });
    expect(
      await testDb.db
        .selectDistinct({ status: aiObservations.status })
        .from(aiObservations)
        .where(eq(aiObservations.runId, stuck.id)),
    ).toEqual([{ status: "failed" }]);
  });

  it("marks only prompts with collected answer text as having results", async () => {
    const run = await runCheck({ projectId, maxCostUsd: 1 }, customer);
    const answers = await repo.getObservations([run.id]);
    for (const answer of answers)
      await testDb.db
        .update(aiObservations)
        .set({
          status: "completed",
          // A completed collection without text means no answer was shown.
          answerMarkdown:
            answer.prompt === "Is OpenSEO good?" ? "OpenSEO is good." : null,
        })
        .where(eq(aiObservations.id, answer.id));

    const { prompts } = await getTracker({ projectId });

    expect(
      Object.fromEntries(
        prompts.map((prompt) => [prompt.text, prompt.hasResults]),
      ),
    ).toEqual({ "Is OpenSEO good?": true, "Which SEO tools?": false });
  });

  it("refuses a check that now costs more than the approved maximum", async () => {
    await expect(
      runCheck({ projectId, maxCostUsd: 0.001 }, customer),
    ).rejects.toMatchObject({ reason: "COST_LIMIT_EXCEEDED" });
    expect(await repo.listRuns(projectId)).toEqual([]);
  });
});
