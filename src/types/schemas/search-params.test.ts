import { describe, expect, it } from "vitest";
import { promptExplorerSearchSchema } from "@/types/schemas/ai-search";
import { backlinksSearchSchema } from "@/types/schemas/backlinks";
import { domainSearchSchema } from "@/types/schemas/domain";
import { rankTrackingDetailSearchSchema } from "@/types/schemas/rank-tracking-search";

describe("search param boolean parsing", () => {
  it("parses explicit false values for domain search params", () => {
    const parsed = domainSearchSchema.parse({
      subdomains: "false",
    });

    expect(parsed).toEqual({
      subdomains: false,
    });
  });

  it("drops invalid optional domain pagination params", () => {
    const parsed = domainSearchSchema.parse({
      page: "0",
      size: "25",
      loc: "not-a-location",
    });

    expect(parsed).toEqual({
      page: undefined,
      size: undefined,
      loc: undefined,
    });
  });
});

describe("table view search params", () => {
  it("drops unknown values instead of failing the route", () => {
    expect(backlinksSearchSchema.parse({ tab: "nope" }).tab).toBeUndefined();
    expect(
      promptExplorerSearchSchema.parse({
        models: ["not-a-model"],
        cc: "??",
        web: "maybe",
      }),
    ).toEqual({ models: undefined, cc: "default", web: undefined });
  });

  it("keeps a text filter that the router parsed as a number", () => {
    // The router reads `?include=42` as the number 42.
    expect(rankTrackingDetailSearchSchema.parse({ include: 42 }).include).toBe(
      "42",
    );
  });
});

it("preserves Bulgarian prompts and country choices in Prompt Explorer URLs", () => {
  const q = "Кое студио в София бихте препоръчали за PPF защитно фолио?";
  expect(promptExplorerSearchSchema.parse({ q, cc: "BG" })).toMatchObject({
    q,
    cc: "BG",
  });
  expect(promptExplorerSearchSchema.parse({ cc: "default" }).cc).toBe(
    "default",
  );
});

it("starts new prompt searches without a country while preserving older US links", () => {
  expect(promptExplorerSearchSchema.parse({}).cc).toBe("default");
  expect(
    promptExplorerSearchSchema.parse({ q: "Find a local studio" }).cc,
  ).toBe("US");
  expect(
    promptExplorerSearchSchema.parse({
      q: "Find a local studio",
      cc: "default",
    }).cc,
  ).toBe("default");
});
