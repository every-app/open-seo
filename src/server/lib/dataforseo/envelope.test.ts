import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  assertOk,
  DataforseoChargedTaskError,
  parseTaskItems,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

const itemSchema = z.object({ keyword: z.string().optional() }).passthrough();

describe("parseTaskItems", () => {
  it("returns [] when the result items are null", () => {
    const task = { status_code: 20000, result: [{ items: null }] };
    expect(parseTaskItems("x", task, itemSchema)).toEqual([]);
  });

  it("returns [] when there is no result", () => {
    expect(parseTaskItems("x", { result: undefined }, itemSchema)).toEqual([]);
  });

  it("parses present items", () => {
    const task = { result: [{ items: [{ keyword: "seo" }] }] };
    expect(parseTaskItems("x", task, itemSchema)).toEqual([{ keyword: "seo" }]);
  });
});

describe("assertOk", () => {
  const okTask = {
    status_code: 20000,
    path: ["v3", "backlinks", "summary", "live"],
    cost: 0.1,
    result_count: 1,
    result: [],
  };

  it("returns the first task on success", () => {
    expect(assertOk({ status_code: 20000, tasks: [okTask] })).toBe(okTask);
  });

  it("throws DataforseoChargedTaskError when a charged task fails", () => {
    const task = {
      status_code: 40000,
      status_message: "fail",
      path: ["v3", "backlinks", "summary", "live"],
      cost: 0.05,
      result_count: 0,
    };
    try {
      assertOk({ status_code: 20000, tasks: [task] });
      throw new Error("expected assertOk to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DataforseoChargedTaskError);
      if (error instanceof DataforseoChargedTaskError) {
        expect(error.billing).toEqual({
          path: task.path,
          costUsd: 0.05,
        });
      }
    }
  });

  it("uses the classifier for non-charged (no-cost) failures", () => {
    const classify = vi.fn(() => new AppError("BACKLINKS_NOT_ENABLED", "nope"));
    const task = {
      status_code: 40204,
      status_message: "subscription required",
    };
    expect(() =>
      assertOk(
        { status_code: 20000, tasks: [task] },
        { classify, classifyPath: "/v3/backlinks/summary/live" },
      ),
    ).toThrow("nope");
    expect(classify).toHaveBeenCalledWith(
      40204,
      "subscription required",
      "/v3/backlinks/summary/live",
    );
  });

  it.each([
    [40204, "BACKLINKS_NOT_ENABLED"],
    [403, "BACKLINKS_NOT_ENABLED"],
    [40200, "BACKLINKS_BILLING_ISSUE"],
  ] as const)(
    "uses the classifier for account failure %s before charging billed task metadata",
    (status, code) => {
      const classify = vi.fn(
        () => new AppError(code, "Classified DataForSEO account failure"),
      );
      const task = {
        status_code: status,
        status_message: "Backlinks subscription required",
        path: ["v3", "backlinks", "summary", "live"],
        cost: 0.05,
        result_count: 0,
      };

      try {
        assertOk({ status_code: 20000, tasks: [task] }, { classify });
        throw new Error("expected assertOk to throw");
      } catch (error) {
        expect(error).not.toBeInstanceOf(DataforseoChargedTaskError);
        expect(error).toMatchObject({ code });
      }
      expect(classify).toHaveBeenCalledWith(
        status,
        "Backlinks subscription required",
        "/v3/backlinks/summary/live",
      );
    },
  );

  it("treats 40501 as an empty success when asked", () => {
    const task = {
      status_code: 40501,
      status_message: "No Search Results",
      path: ["v3", "serp", "google", "organic", "live", "advanced"],
      cost: 0.0,
    };
    expect(
      assertOk(
        { status_code: 20000, tasks: [task] },
        { treatNoResultsAsEmpty: true },
      ),
    ).toBe(task);
  });
});
