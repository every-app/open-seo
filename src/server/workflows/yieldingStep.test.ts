import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import { yieldingStep } from "./yieldingStep";

afterEach(() => {
  vi.useRealTimers();
});

it("pauses before the first step that starts two minutes into a run, named after that step", async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only do and sleep are exercised
  const engine = {
    do: async (name: string, callback: () => Promise<unknown>) => {
      calls.push(name);
      return callback();
    },
    sleep: async (name: string) => {
      calls.push(name);
    },
  } as unknown as WorkflowStep;
  const step = yieldingStep(engine);
  const minutes = (n: number) => async () => {
    vi.advanceTimersByTime(n * 60_000);
  };

  await step.do("a", minutes(1));
  await step.do("b", minutes(1.5));
  await step.do("c", minutes(1));
  await step.do("d", minutes(0));

  expect(calls).toEqual(["a", "b", "yield-before-c", "c", "d"]);
});
