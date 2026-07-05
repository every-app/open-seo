import { describe, expect, it } from "vitest";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";

describe("shouldCaptureAppErrorCode", () => {
  it.each([
    "UNAUTHENTICATED",
    "NOT_FOUND",
    "PAYMENT_REQUIRED",
    "VALIDATION_ERROR",
    "AUDIT_CAPACITY_REACHED",
    "AUDIT_PAGE_LIMIT_EXCEEDED",
    "AUDIT_ALREADY_RUNNING",
  ] as const)("skips expected %s errors", (code) => {
    expect(shouldCaptureAppErrorCode(code)).toBe(false);
  });

  it("captures unexpected errors and unknown failures", () => {
    expect(shouldCaptureAppErrorCode("INTERNAL_ERROR")).toBe(true);
    expect(shouldCaptureAppErrorCode(undefined)).toBe(true);
    // On cloud the shared DataForSEO account has these add-ons, so these firing
    // signals a real platform problem — keep them reportable, don't suppress.
    expect(shouldCaptureAppErrorCode("BACKLINKS_NOT_ENABLED")).toBe(true);
    expect(shouldCaptureAppErrorCode("AI_SEARCH_NOT_ENABLED")).toBe(true);
  });
});
