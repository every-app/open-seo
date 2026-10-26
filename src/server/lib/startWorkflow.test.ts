import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startWorkflow } from "./startWorkflow";

const workflow = { create: vi.fn(), get: vi.fn() };
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only create and get run
const binding = workflow as unknown as Workflow<{ runId: string }>;
const options = { id: "instance", params: { runId: "run" } };

beforeEach(() => {
  vi.useFakeTimers();
  workflow.create.mockResolvedValue({});
  workflow.get.mockRejectedValue(new Error("instance.not_found"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("startWorkflow", () => {
  it("creates the instance again after the engine refuses once", async () => {
    workflow.create.mockRejectedValueOnce(new Error("internal error"));
    const started = startWorkflow(binding, options, "test");
    await vi.advanceTimersByTimeAsync(10_000);
    await started;
    expect(workflow.create).toHaveBeenCalledTimes(2);
    expect(workflow.create).toHaveBeenLastCalledWith(options);
  });

  it("counts a refused create whose instance exists as started", async () => {
    workflow.create.mockRejectedValue(new Error("reply lost"));
    workflow.get.mockResolvedValue({
      status: async () => ({ status: "running" }),
    });
    await startWorkflow(binding, options, "test");
    expect(workflow.create).toHaveBeenCalledOnce();
  });

  it("throws once every attempt is refused", async () => {
    workflow.create.mockRejectedValue(new Error("internal error"));
    const outcome = startWorkflow(binding, options, "test").catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toEqual(new Error("internal error"));
    expect(workflow.create).toHaveBeenCalledTimes(3);
  });
});
