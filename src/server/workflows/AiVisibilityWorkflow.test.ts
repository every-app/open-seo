import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import { AiVisibilityWorkflow } from "./AiVisibilityWorkflow";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  post: vi.fn(),
  live: vi.fn(),
  model: vi.fn(),
  collect: vi.fn(),
  finalize: vi.fn(),
  markFailed: vi.fn(),
  sleep: vi.fn(),
  steps: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: vi.fn() }));
vi.mock("@/server/features/ai-visibility/services/aiResearchKeywords", () => ({
  runAiResearchSetup: vi.fn(),
}));
vi.mock(
  "@/server/features/ai-visibility/services/aiVisibilityCollection",
  () => ({
    prepareAiRun: mocks.prepare,
    postAiBatch: mocks.post,
    collectAiLiveBatch: mocks.live,
    collectAiModelBatch: mocks.model,
    collectAiRound: mocks.collect,
    finalizeAiRun: mocks.finalize,
    markAiRunFailed: mocks.markFailed,
  }),
);
vi.mock("./pgStep", () => ({
  pgStep: (
    _step: unknown,
    name: string,
    config: unknown,
    fn: () => Promise<unknown>,
  ) => {
    mocks.steps(name, config);
    return fn();
  },
}));

const customer = {
  organizationId: "organization",
  userId: "user",
  userEmail: "user@example.com",
};
const task = { tag: "answer", taskId: "task", engine: "chatgpt" };
function execute() {
  // The mocked base and pgStep use no execution context, bindings, or step methods besides sleep.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal test runtime boundary
  const workflow = new AiVisibilityWorkflow({} as ExecutionContext, {} as Env);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pgStep is mocked; only sleep executes
  const step = { sleep: mocks.sleep } as unknown as WorkflowStep;
  return workflow.run(
    {
      payload: { runId: "run", customer },
      instanceId: "run",
      timestamp: new Date("2026-09-05T12:00:00Z"),
    },
    step,
  );
}
beforeEach(() => {
  mocks.prepare.mockResolvedValue({
    market: { locationCode: 2840, languageCode: "en" },
    modelBatches: [],
    live: false,
    batches: [
      { engine: "chatgpt", tasks: [] },
      { engine: "gemini", tasks: [] },
    ],
  });
  mocks.post.mockResolvedValue([task]);
  mocks.collect.mockResolvedValue([]);
});

describe("AI visibility workflow", () => {
  it("posts each batch in a step that never retries, then collects and finalizes", async () => {
    await execute();
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.steps).toHaveBeenCalledWith("post-1", {
      retries: { limit: 0, delay: "1 second" },
      timeout: "2 minutes",
    });
    expect(mocks.collect).toHaveBeenCalledExactlyOnceWith("run", [task, task]);
    expect(mocks.sleep).toHaveBeenCalledOnce();
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith("run");
  });

  it("asks the model API for Claude and Perplexity, then reads queued answers before sleeping", async () => {
    mocks.prepare.mockResolvedValue({
      market: { locationCode: 2840, languageCode: "en" },
      modelBatches: [{ engine: "claude", tasks: [] }],
      live: false,
      batches: [{ engine: "chatgpt", tasks: [] }],
    });
    await execute();
    expect(mocks.model).toHaveBeenCalledOnce();
    expect(mocks.steps).toHaveBeenCalledWith("collect-model-0", {
      retries: { limit: 2, delay: "10 seconds" },
      timeout: "5 minutes",
    });
    expect(mocks.sleep).not.toHaveBeenCalled();
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith("run");
  });

  it("collects a manual run's live batches without posting or polling", async () => {
    mocks.prepare.mockResolvedValue({
      market: { locationCode: 2840, languageCode: "en" },
      modelBatches: [],
      live: true,
      batches: [[]],
    });
    await execute();
    expect(mocks.live).toHaveBeenCalledOnce();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.sleep).not.toHaveBeenCalled();
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith("run");
  });

  it("stops polling when the collection window closes and finalizes what arrived", async () => {
    mocks.collect.mockResolvedValue([task]);
    await execute();
    expect(mocks.sleep).toHaveBeenCalledTimes(9);
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });

  it("fails the run when preparation fails, such as when credits run out", async () => {
    const error = new Error("Not enough credits");
    mocks.prepare.mockRejectedValue(error);
    await expect(execute()).rejects.toThrow(error);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledExactlyOnceWith("run", error);
  });

  it("does not log a rejected poll sleep as a failure, but still marks the run failed", async () => {
    const error = new Error();
    mocks.sleep.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error");
    await expect(execute()).rejects.toThrow(error);
    expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledExactlyOnceWith("run", error);
  });
});
