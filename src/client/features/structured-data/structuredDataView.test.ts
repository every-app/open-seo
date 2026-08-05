import { describe, expect, it } from "vitest";
import {
  describeLocation,
  groupFindingsBySeverity,
  summaryLine,
  type FindingView,
  type ValidationView,
} from "@/client/features/structured-data/structuredDataView";

function finding(overrides: Partial<FindingView> = {}): FindingView {
  return {
    code: "unknown-property",
    severity: "error",
    layer: "vocabulary",
    message: "Something is wrong.",
    scriptIndex: 0,
    path: "/author",
    ...overrides,
  } as FindingView;
}

function view(overrides: Partial<ValidationView> = {}): ValidationView {
  return {
    schemaVersion: "30.0",
    scriptCount: 1,
    nodeCount: 1,
    types: [],
    features: [],
    notCheckedTypes: [],
    findings: [],
    errorCount: 0,
    warningCount: 0,
    ...overrides,
  } as ValidationView;
}

describe("summaryLine", () => {
  it("pluralizes each count, including entities", () => {
    expect(
      summaryLine(
        view({
          scriptCount: 2,
          nodeCount: 13,
          errorCount: 1,
          warningCount: 5,
        }),
      ),
    ).toBe(
      "2 JSON-LD blocks · 13 entities · 1 error · 5 warnings · Schema.org 30.0",
    );
  });

  it("uses singular forms at one", () => {
    expect(
      summaryLine(
        view({
          scriptCount: 1,
          nodeCount: 1,
          errorCount: 1,
          warningCount: 1,
        }),
      ),
    ).toBe(
      "1 JSON-LD block · 1 entity · 1 error · 1 warning · Schema.org 30.0",
    );
  });
});

describe("groupFindingsBySeverity", () => {
  it("orders errors, then warnings, then notes", () => {
    const groups = groupFindingsBySeverity([
      finding({ severity: "info" }),
      finding({ severity: "warning" }),
      finding({ severity: "error" }),
      finding({ severity: "warning" }),
    ]);
    expect(groups.map((group) => group.severity)).toEqual([
      "error",
      "warning",
      "info",
    ]);
    expect(groups[1]?.findings).toHaveLength(2);
  });

  it("omits severities with nothing in them", () => {
    const groups = groupFindingsBySeverity([finding({ severity: "warning" })]);
    expect(groups.map((group) => group.severity)).toEqual(["warning"]);
  });

  it("returns nothing for a clean result", () => {
    expect(groupFindingsBySeverity([])).toEqual([]);
  });
});

describe("describeLocation", () => {
  it("names the root of a single block plainly", () => {
    expect(describeLocation(finding({ path: "" }), 1)).toBe("root");
  });

  it("keeps the JSON pointer for a single block", () => {
    expect(describeLocation(finding({ path: "/author/name" }), 1)).toBe(
      "/author/name",
    );
  });

  it("prefixes the block when a page has several", () => {
    expect(
      describeLocation(finding({ path: "/author", scriptIndex: 2 }), 3),
    ).toBe("block 3 · /author");
  });
});
