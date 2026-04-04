import { describe, expect, it } from "vitest";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";

describe("shouldCaptureAppErrorCode", () => {
  it.each([
    "UNAUTHENTICATED",
    "NOT_FOUND",
    "PAYMENT_REQUIRED",
    "VALIDATION_ERROR",
  ] as const)("skips expected %s errors", (code) => {
    expect(shouldCaptureAppErrorCode(code)).toBe(false);
  });

  it("captures unexpected errors and unknown failures", () => {
    expect(shouldCaptureAppErrorCode("INTERNAL_ERROR")).toBe(true);
    expect(shouldCaptureAppErrorCode(undefined)).toBe(true);
  });
});
