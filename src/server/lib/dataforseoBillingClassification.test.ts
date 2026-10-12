import { describe, expect, it } from "vitest";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";

const classify = createDataforseoBillingClassifier({
  pathPrefix: "/backlinks/",
  billingIssueCode: "BACKLINKS_BILLING_ISSUE",
  billingIssueMessage: "billing issue",
});

describe("createDataforseoBillingClassifier", () => {
  it.each([
    [
      "the path is outside the configured prefix",
      402,
      "payment required",
      "/v3/serp/google/live",
    ],
    [
      "neither status nor text matches",
      500,
      "boom",
      "/v3/backlinks/summary/live",
    ],
  ])("returns null when %s", (_label, status, message, path) => {
    expect(classify(status, message, path)).toBe(null);
  });

  it.each([40200, 40210, 402])(
    "translates billing status %s into the configured billing error code",
    (status) => {
      const err = classify(status, "", "/v3/backlinks/summary/live");
      expect(err?.code).toBe("BACKLINKS_BILLING_ISSUE");
    },
  );

  it("translates billing signals in the message case-insensitively", () => {
    const err = classify(
      undefined,
      "INSUFFICIENT funds",
      "/v3/backlinks/summary/live",
    );
    expect(err?.code).toBe("BACKLINKS_BILLING_ISSUE");
  });
});
