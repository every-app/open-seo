import { describe, expect, it } from "vitest";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";

describe("shouldCaptureAppErrorCode", () => {
  it("skips expected user-facing errors", () => {
    expect(shouldCaptureAppErrorCode("NOT_FOUND")).toBe(false);
    expect(shouldCaptureAppErrorCode("UPSTREAM_UNAVAILABLE")).toBe(false);
  });

  it("captures unexpected errors and unknown failures", () => {
    expect(shouldCaptureAppErrorCode("INTERNAL_ERROR")).toBe(true);
    expect(shouldCaptureAppErrorCode(undefined)).toBe(true);
    // A depleted DataForSEO balance is a real platform problem on cloud — keep
    // the billing codes reportable, don't suppress them.
    expect(shouldCaptureAppErrorCode("BACKLINKS_BILLING_ISSUE")).toBe(true);
    expect(shouldCaptureAppErrorCode("AI_SEARCH_BILLING_ISSUE")).toBe(true);
  });
});
