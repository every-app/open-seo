import { describe, expect, it } from "vitest";
import { backlinksSearchSchema } from "@/types/schemas/backlinks";
import { domainSearchSchema } from "@/types/schemas/domain";

describe("search param boolean parsing", () => {
  it("parses backlinks search params with target and tab", () => {
    const parsed = backlinksSearchSchema.parse({
      target: "example.com",
      tab: "domains",
    });

    expect(parsed).toEqual({
      target: "example.com",
      tab: "domains",
    });
  });

  it("parses explicit false values for domain search params", () => {
    const parsed = domainSearchSchema.parse({
      subdomains: "false",
    });

    expect(parsed).toEqual({
      subdomains: false,
    });
  });
});
