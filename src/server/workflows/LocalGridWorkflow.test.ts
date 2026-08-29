import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import type { PostedLocalGridTask } from "@/server/lib/dataforseo";

const mocks = vi.hoisted(() => ({
  fetchLocalGridTaskResult: vi.fn(),
  pgStep: vi.fn(),
  sleep: vi.fn(),
  getRun: vi.fn(),
  getConfig: vi.fn(),
  updateRun: vi.fn(),
  getRunTaskInputs: vi.fn(),
  recordPostedTasks: vi.fn(),
  markResultFailed: vi.fn(),
  recordCompletedTask: vi.fn(),
  getRunProgress: vi.fn(),
  localGridTaskPost: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: vi.fn(),
}));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class extends Error {},
}));
vi.mock("@/db", () => ({ withPgClient: (fn: () => unknown) => fn() }));
vi.mock("@/server/workflows/pgStep", () => ({ pgStep: mocks.pgStep }));
vi.mock("@/server/features/local-seo/repositories/LocalGridRepository", () => ({
  LocalGridRepository: {
    getRun: mocks.getRun,
    getConfig: mocks.getConfig,
    updateRun: mocks.updateRun,
    getRunTaskInputs: mocks.getRunTaskInputs,
    recordPostedTasks: mocks.recordPostedTasks,
    markResultFailed: mocks.markResultFailed,
    recordCompletedTask: mocks.recordCompletedTask,
    getRunProgress: mocks.getRunProgress,
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    serp: { localGridTaskPost: mocks.localGridTaskPost },
  }),
  fetchLocalGridTaskResult: mocks.fetchLocalGridTaskResult,
  MAX_TASKS_PER_POST: 100,
}));

import { LocalGridWorkflow } from "./LocalGridWorkflow";

const gridPointCount = 49;
const keywords = ["roof repairs worthing", "roofer worthing"];
const taskCount = gridPointCount * keywords.length;
const tasks = Array.from({ length: taskCount }, (_, index) => ({
  resultId: `result-${index}`,
  pointId: `point-${Math.floor(index / keywords.length)}`,
  keywordId: `keyword-${(index % keywords.length) + 1}`,
  keyword: keywords[index % keywords.length],
  latitude: 50.8 + Math.floor(index / keywords.length) / 10_000,
  longitude: -0.37,
  providerTaskId: null,
  status: "pending" as const,
}));

const posted = tasks.map((task, index) => ({
  resultId: task.resultId,
  pointId: task.pointId,
  keywordId: task.keywordId,
  keyword: task.keyword,
  locationCoordinate: `${task.latitude.toFixed(7)},${task.longitude.toFixed(7)},14z`,
  taskId: `provider-${index}`,
  costUsd: 0.001,
}));

describe("LocalGridWorkflow collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRun.mockResolvedValue({ id: "run-1", status: "pending" });
    mocks.getConfig.mockResolvedValue({
      config: { isActive: true },
      business: {},
      keywords: [],
    });
    mocks.getRunTaskInputs.mockResolvedValue(tasks);
    mocks.localGridTaskPost.mockResolvedValue(posted);
    mocks.fetchLocalGridTaskResult.mockImplementation(
      async (task: PostedLocalGridTask) => ({
        status: "completed",
        result: {
          resultId: task.resultId,
          pointId: task.pointId,
          keywordId: task.keywordId,
          keyword: task.keyword,
          targetRank: null,
          matchedBy: "none",
          rankings: [],
        },
      }),
    );
    mocks.getRunProgress.mockResolvedValue({
      completed: taskCount,
      failed: 0,
      providerCostUsd: 0.049,
    });
    mocks.pgStep.mockImplementation(
      async (
        _step: unknown,
        name: string,
        _config: unknown,
        callback: () => Promise<unknown>,
      ) => {
        const fetchesBefore = mocks.fetchLocalGridTaskResult.mock.calls.length;
        const value = await callback();
        const fetchesAfter = mocks.fetchLocalGridTaskResult.mock.calls.length;
        if (name.startsWith("collect-")) {
          expect(fetchesAfter - fetchesBefore).toBeLessThanOrEqual(5);
        }
        return value;
      },
    );
  });

  it("collects a 7x7 scan with two keywords in bounded durable steps", async () => {
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- mocked Worker base does not inspect constructor context
    const workflow = new LocalGridWorkflow({} as ExecutionContext, {} as Env);
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- the workflow only calls the mocked sleep method
    const step = { sleep: mocks.sleep } as unknown as WorkflowStep;

    await workflow.run(
      {
        instanceId: "run-1",
        timestamp: new Date(),
        payload: {
          runId: "run-1",
          configId: "config-1",
          projectId: "project-1",
          billingCustomer: {
            userId: "user-1",
            userEmail: "user@example.com",
            organizationId: "org-1",
          },
          languageCode: "en",
          seDomain: null,
          searchDepth: 20,
          searchPlaces: false,
          target: { placeId: "place-1", cid: null, featureId: null },
        },
      },
      step,
    );

    expect(mocks.fetchLocalGridTaskResult).toHaveBeenCalledTimes(taskCount);
    expect(mocks.localGridTaskPost).toHaveBeenCalledTimes(1);
    expect(
      mocks.pgStep.mock.calls.filter(([, name]) =>
        String(name).startsWith("collect-"),
      ),
    ).toHaveLength(Math.ceil(taskCount / 5));
  });
});
