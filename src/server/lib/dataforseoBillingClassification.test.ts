import { describe, expect, it } from "vitest";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";

const classify = createDataforseoBillingClassifier({
  pathPrefix: "/backlinks/",
  billingIssueCode: "BACKLINKS_BILLING_ISSUE",
  billingIssueMessage: "billing issue",
});

describe("createDataforseoBillingClassifier", () => {
  it("returns null when the path is outside the configured prefix", () => {
    expect(classify(402, "payment required", "/v3/serp/google/live")).toBe(
      null,
    );
  });

  it.each([40200, 40210, 402])(
    "translates billing status %s into the configured billing error code",
    (status) => {
      const err = classify(status, "", "/v3/backlinks/summary/live");
      expect(err?.code).toBe("BACKLINKS_BILLING_ISSUE");
    },
  );

  it.each([
    "insufficient funds",
    "payment required",
    "balance is too low",
    "problem billing",
    "account was not recharged",
  ])(
    "translates billing signal %s into the configured billing code",
    (message) => {
      const err = classify(undefined, message, "/v3/backlinks/summary/live");
      expect(err?.code).toBe("BACKLINKS_BILLING_ISSUE");
    },
  );

  it("no longer classifies feature-access signals now that the add-ons are bundled", () => {
    expect(
      classify(40204, "subscription required", "/v3/backlinks/summary/live"),
    ).toBe(null);
    expect(classify(403, "access denied", "/v3/backlinks/summary/live")).toBe(
      null,
    );
  });

  it("returns null when neither status nor text matches", () => {
    expect(classify(500, "boom", "/v3/backlinks/summary/live")).toBe(null);
  });

  it("matches billing signals case-insensitively", () => {
    const err = classify(
      undefined,
      "INSUFFICIENT funds",
      "/v3/backlinks/summary/live",
    );
    expect(err?.code).toBe("BACKLINKS_BILLING_ISSUE");
  });
});
