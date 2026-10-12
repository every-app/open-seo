import { describe, expect, it } from "vitest";
import { saveCrawlerCredentialSchema } from "@/types/schemas/crawlerAccess";

const valid = {
  projectId: "project-1",
  host: "https://store.example.com/collections/all",
  signatureInput: "sig1=(...);expires=4102444800",
  signature: "sig1=:abc:",
};

describe("saveCrawlerCredentialSchema", () => {
  it("normalizes a pasted URL down to its hostname", () => {
    expect(saveCrawlerCredentialSchema.parse(valid).host).toBe(
      "store.example.com",
    );
  });

  it("rejects line breaks, which would inject extra headers", () => {
    expect(
      saveCrawlerCredentialSchema.safeParse({
        ...valid,
        signature: "sig1=:abc:\r\nX-Injected: 1",
      }).success,
    ).toBe(false);
  });

  it("rejects a signature that has already expired", () => {
    expect(
      saveCrawlerCredentialSchema.safeParse({
        ...valid,
        signatureInput: "sig1=(...);expires=1577836800",
      }).success,
    ).toBe(false);
  });
});
