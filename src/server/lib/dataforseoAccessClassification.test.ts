import { describe, expect, it } from "vitest";
import { createDataforseoAccessClassifier } from "@/server/lib/dataforseoAccessClassification";

const classify = createDataforseoAccessClassifier({
  pathPrefix: "/backlinks/",
  notEnabledCode: "BACKLINKS_NOT_ENABLED",
  notEnabledMessage: "not enabled",
  billingIssueCode: "BACKLINKS_BILLING_ISSUE",
  billingIssueMessage: "billing issue",
});

describe("createDataforseoAccessClassifier", () => {
  it("returns null when the path is outside the configured prefix", () => {
    expect(classify(402, "payment required", "/v3/serp/google/live")).toBe(
      null,
    );
  });

  it.each([40204, 403])(
    "translates status %s into the configured error code when inside the path prefix",
    (status) => {
      const err = classify(status, "", "/v3/backlinks/summary/live");
      expect(err?.code).toBe("BACKLINKS_NOT_ENABLED");
    },
  );

  it.each([40200, 40210, 402])(
    "translates billing status %s into the configured billing error code",
    (status) => {
      const err = classify(status, "", "/v3/backlinks/summary/live");
      expect(err?.code).toBe("BACKLINKS_BILLING_ISSUE");
    },
  );

  it.each([
    "subscription required",
    "plans and subscriptions",
    "access denied",
    "forbidden",
  ])("translates signal %s into the configured error code", (message) => {
    const err = classify(undefined, message, "/v3/backlinks/summary/live");
    expect(err?.code).toBe("BACKLINKS_NOT_ENABLED");
  });

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

  it("returns null when neither status nor text matches", () => {
    expect(classify(500, "boom", "/v3/backlinks/summary/live")).toBe(null);
  });

  it("matches signals case-insensitively", () => {
    const err = classify(
      undefined,
      "SUBSCRIPTION required",
      "/v3/backlinks/summary/live",
    );
    expect(err?.code).toBe("BACKLINKS_NOT_ENABLED");
  });
});
