import { describe, expect, it } from "vitest";
import { backlinksSearchSchema } from "@/types/schemas/backlinks";
import { domainSearchSchema } from "@/types/schemas/domain";

describe("search param boolean parsing", () => {
  it("parses explicit false values for backlinks search params", () => {
    const parsed = backlinksSearchSchema.parse({
      subdomains: "false",
      indirect: "false",
      excludeInternal: "false",
    });

    expect(parsed).toEqual({
      subdomains: false,
      indirect: false,
      excludeInternal: false,
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
