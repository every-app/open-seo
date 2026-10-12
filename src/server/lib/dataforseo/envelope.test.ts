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
  it.each([
    { status_code: 20000, result: [{ items: null }] },
    { result: undefined },
  ])("returns [] for a task without items (%o)", (task) => {
    expect(parseTaskItems("x", task, itemSchema)).toEqual([]);
  });
});

describe("assertOk", () => {
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

  it.each([
    // DataForSEO's own SE failure: retryable upstream trouble.
    [40101, "Internal SE Server Error.", "UPSTREAM_UNAVAILABLE"],
    // 'Not Implemented' means we posted a bad task; keep it reportable.
    [50100, "Not Implemented.", "INTERNAL_ERROR"],
  ] as const)(
    "classifies a charged %s '%s' task as %s",
    (status, message, code) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const task = {
        status_code: status,
        status_message: message,
        path: ["v3", "serp", "google", "organic", "live", "advanced"],
        cost: 0.002,
        result_count: 0,
      };
      try {
        assertOk({ status_code: 20000, tasks: [task] });
        throw new Error("expected assertOk to throw");
      } catch (error) {
        // Still a charged-task error so the billed attempt stays metered.
        expect(error).toBeInstanceOf(DataforseoChargedTaskError);
        if (error instanceof DataforseoChargedTaskError) {
          expect(error.code).toBe(code);
        }
      }
    },
  );

  it("uses the classifier for account failures before charging billed task metadata", () => {
    const classify = vi.fn(
      () =>
        new AppError(
          "BACKLINKS_BILLING_ISSUE",
          "Classified DataForSEO account failure",
        ),
    );
    const task = {
      status_code: 40200,
      status_message: "Account balance is too low",
      path: ["v3", "backlinks", "summary", "live"],
      cost: 0.05,
      result_count: 0,
    };

    try {
      assertOk({ status_code: 20000, tasks: [task] }, { classify });
      throw new Error("expected assertOk to throw");
    } catch (error) {
      expect(error).not.toBeInstanceOf(DataforseoChargedTaskError);
      expect(error).toMatchObject({ code: "BACKLINKS_BILLING_ISSUE" });
    }
    expect(classify).toHaveBeenCalledWith(
      40200,
      "Account balance is too low",
      "/v3/backlinks/summary/live",
    );
  });

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

  it("still surfaces a charged 40501 'Invalid Field' failure even with treatNoResultsAsEmpty", () => {
    // 40501 is not unique to no-results — it also covers validation rejections,
    // which are real charged failures we must not mask as empty results.
    const task = {
      status_code: 40501,
      status_message: "Invalid Field: 'categories'.",
      path: ["v3", "business_data", "business_listings", "search", "live"],
      cost: 0.02,
      result_count: 0,
      data: { categories: ["not_a_real_category"] },
    };
    try {
      assertOk(
        { status_code: 20000, tasks: [task] },
        { treatNoResultsAsEmpty: true },
      );
      throw new Error("expected assertOk to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DataforseoChargedTaskError);
      if (error instanceof DataforseoChargedTaskError) {
        expect(error.billing).toEqual({ path: task.path, costUsd: 0.02 });
        expect(error.isInvalidField).toBe(true);
      }
    }
  });
});
