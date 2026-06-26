import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const dbWhere = vi.fn().mockResolvedValue(undefined);
  const dbSet = vi.fn(() => ({ where: dbWhere }));
  const dbUpdate = vi.fn(() => ({ set: dbSet }));

  return {
    dbUpdate,
    dbSet,
    dbWhere,
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { update: mocks.dbUpdate } }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(),
}));

import {
  getDueKeywordsForScheduledRun,
  RankTrackingService,
} from "./RankTrackingService";

type TestKeyword = {
  id: string;
  scheduleIntervalOverride: "inherit" | "daily" | "weekly" | "manual-paused";
  nextCheckAt: string | null;
};

function keyword(
  id: string,
  scheduleIntervalOverride: TestKeyword["scheduleIntervalOverride"] =
    "inherit",
  nextCheckAt: string | null = null,
): TestKeyword {
  return { id, scheduleIntervalOverride, nextCheckAt };
}

describe("RankTrackingService keyword scheduling", () => {
  const nowIso = "2026-06-25T12:00:00.000Z";

  beforeEach(() => {
    mocks.dbUpdate.mockClear();
    mocks.dbSet.mockClear();
    mocks.dbWhere.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes due keywords from inherited config intervals and per-keyword overrides", () => {
    const due = getDueKeywordsForScheduledRun(
      {
        scheduleInterval: "weekly",
        nextCheckAt: "2026-06-25T08:00:00.000Z",
      },
      [
        keyword("inherited"),
        keyword("daily-due", "daily", "2026-06-25T11:00:00.000Z"),
        keyword("weekly-due-now", "weekly", null),
        keyword("daily-future", "daily", "2026-06-26T11:00:00.000Z"),
        keyword("paused", "manual-paused", null),
      ],
      nowIso,
    );

    expect(due.map((kw) => kw.id)).toEqual([
      "inherited",
      "daily-due",
      "weekly-due-now",
    ]);
  });

  it("advances nextCheckAt for due per-keyword scheduled overrides", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));

    await RankTrackingService.advanceKeywordSchedulesForScheduledRun([
      keyword("daily", "daily", "2026-06-23T05:00:00.000Z"),
      keyword("inherited", "inherit", null),
      keyword("paused", "manual-paused", null),
    ]);

    expect(mocks.dbSet).toHaveBeenCalledTimes(1);
    expect(mocks.dbSet).toHaveBeenCalledWith({
      nextCheckAt: "2026-06-26T05:00:00.000Z",
    });
  });

  it("keeps default due behavior unchanged when no keyword overrides exist", () => {
    const keywords = [keyword("one"), keyword("two")];

    expect(
      getDueKeywordsForScheduledRun(
        {
          scheduleInterval: "weekly",
          nextCheckAt: "2026-06-25T08:00:00.000Z",
        },
        keywords,
        nowIso,
      ).map((kw) => kw.id),
    ).toEqual(["one", "two"]);

    expect(
      getDueKeywordsForScheduledRun(
        {
          scheduleInterval: "weekly",
          nextCheckAt: "2026-06-26T08:00:00.000Z",
        },
        keywords,
        nowIso,
      ),
    ).toEqual([]);

    expect(
      getDueKeywordsForScheduledRun(
        { scheduleInterval: "manual", nextCheckAt: null },
        keywords,
        nowIso,
      ),
    ).toEqual([]);
  });
});
