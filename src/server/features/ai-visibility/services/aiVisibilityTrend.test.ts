import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunRow } from "../repositories/AiVisibilityRepository";
import type { getTrendObservations } from "../repositories/aiVisibilityTrendRepository";
import { aiTrendSchema } from "@/types/schemas/ai-visibility";
import { loadAiTrend } from "./aiVisibilityTrend";

const mocks = vi.hoisted(() => ({
  listTrendRuns: vi.fn(),
  getTrendObservations: vi.fn(),
}));
vi.mock("../repositories/aiVisibilityTrendRepository", () => mocks);

type Row = Awaited<ReturnType<typeof getTrendObservations>>[number];
const projectId = "00000000-0000-4000-8000-000000000001";
const input = aiTrendSchema.parse({ projectId, days: 7 });

function run(id: string, daysAgo: number, overrides: Partial<RunRow> = {}) {
  return {
    id,
    createdAt: new Date(
      Date.parse("2026-10-01T12:00:00.000Z") - daysAgo * 86_400_000,
    ).toISOString(),
    locationCode: 2840,
    languageCode: "en",
    ...overrides,
  };
}
function answer(
  runId: string,
  promptId: string,
  mentioned: boolean,
  overrides: Partial<Row> = {},
): Row {
  return {
    runId,
    promptId,
    engine: "chatgpt",
    branded: false,
    status: "completed",
    hasAnswer: 1,
    brandName: "OpenSEO",
    brandDomain: "openseo.so",
    mentioned,
    cited: false,
    ...overrides,
  };
}
const failed = (runId: string, promptId: string) =>
  answer(runId, promptId, false, {
    status: "failed",
    hasAnswer: 0,
    mentioned: null,
    cited: null,
  });

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00.000Z") });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("loadAiTrend", () => {
  it("weights each matched prompt and engine equally and ignores new prompts", async () => {
    mocks.listTrendRuns.mockResolvedValue([
      run("old", 10),
      run("new-1", 3),
      run("new-2", 1),
    ]);
    mocks.getTrendObservations.mockResolvedValue([
      answer("old", "a", false),
      answer("old", "b", false),
      answer("new-1", "a", true),
      answer("new-2", "a", true),
      answer("new-2", "b", false),
      answer("new-2", "added", true),
    ]);

    const trend = await loadAiTrend(input);

    expect(trend.comparison).toBe("comparable");
    // Pooled answers would give 2 of 3 (67%) for the matched pairs. The mean
    // of the two cell rates is (100% + 0%) / 2.
    expect(trend.mentions).toMatchObject({
      current: 50,
      previous: 0,
      change: 50,
      matchedCells: 2,
      currentCells: 3,
    });
    // Run points use the same matched cells, so the added prompt stays out.
    expect(trend.runs.map((point) => point.mentionRate)).toEqual([0, 100, 50]);
  });

  it("does not count failed collections as lost visibility", async () => {
    // "new" collected one of two answers.
    mocks.listTrendRuns.mockResolvedValue([run("old", 10), run("new", 1)]);
    mocks.getTrendObservations.mockResolvedValue([
      answer("old", "a", true),
      answer("new", "a", true),
      failed("new", "b"),
    ]);

    const trend = await loadAiTrend(input);

    expect(trend.comparison).toBe("incomplete");
    expect(trend.mentions).toMatchObject({
      current: 100,
      previous: 100,
      change: null,
    });
    expect(trend.current.coverage).toMatchObject({
      expected: 2,
      answered: 1,
      failed: 1,
    });
  });

  it.each([
    ["market", {}, { locationCode: 2826 }],
    ["brand", { brandDomain: "openseo.com" }, {}],
  ] as const)(
    "reports a scope change when the %s changes",
    async (_, answerChange, runChange) => {
      mocks.listTrendRuns.mockResolvedValue([
        run("old", 10),
        run("new", 1, runChange),
      ]);
      mocks.getTrendObservations.mockResolvedValue([
        answer("old", "a", false),
        answer("new", "a", true, answerChange),
      ]);

      const trend = await loadAiTrend(input);

      expect(trend.comparison).toBe("scope_changed");
      expect(trend.mentions).toMatchObject({
        current: 100,
        previous: null,
        change: null,
        matchedCells: 0,
      });
    },
  );
});
