import { beforeEach, expect, it, vi } from "vitest";
import { projects } from "@/db/schema";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { runScheduledAiVisibility } from "./scheduledAiVisibility";
import { configuration } from "./aiVisibilityTestFixtures";

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
vi.mock("./aiVisibilityRetention", () => ({ pruneAiVisibility: vi.fn() }));

const due = "2026-09-01T06:00:00.000Z";
async function dueTracker(projectId: string, paused: boolean) {
  const rows = configuration(
    { engines: ["chatgpt"], prompts: [{ text: "Which SEO tools?", paused }] },
    projectId,
  );
  await repo.saveConfiguration(rows);
  await repo.updateTracker(rows.tracker.id, {
    enabled: true,
    nextCheckAt: due,
  });
}

beforeEach(async () => {
  await testDb.seedProject();
  await testDb.db.insert(projects).values({
    id: "paused-project",
    organizationId: "organization",
    name: "Paused",
    domain: "paused.example",
  });
});

it("moves every due tracker on, including one whose check cannot start", async () => {
  await dueTracker("paused-project", true);
  await dueTracker("project", false);

  await runScheduledAiVisibility();

  const skipped = await repo.getTracker("paused-project");
  expect(skipped?.nextCheckAt).not.toBe(due);
  expect(skipped?.lastSkipReason).toMatch(/unpause prompts/);
  expect((await repo.getTracker("project"))?.nextCheckAt).not.toBe(due);
  expect(await repo.listRuns("project")).toMatchObject([
    { trigger: "baseline", status: "queued" },
  ]);
});
