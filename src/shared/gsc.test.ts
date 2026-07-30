import { describe, expect, it } from "vitest";
import { flattenRichResultIssues } from "@/shared/gsc";

describe("flattenRichResultIssues", () => {
  it("flattens issues across result types and items", () => {
    const issues = flattenRichResultIssues({
      verdict: "FAIL",
      detectedItems: [
        {
          richResultType: "Recipes",
          items: [
            {
              name: "Pavlova",
              issues: [
                { issueMessage: "Missing field 'image'", severity: "ERROR" },
              ],
            },
            {
              name: "Lamingtons",
              issues: [
                {
                  issueMessage: "Missing field 'name' (in 'author')",
                  severity: "WARNING",
                },
              ],
            },
          ],
        },
        {
          richResultType: "Breadcrumbs",
          items: [
            {
              name: "Home > Recipes",
              issues: [{ issueMessage: "Invalid 'position'" }],
            },
          ],
        },
      ],
    });

    expect(issues).toEqual([
      {
        richResultType: "Recipes",
        itemName: "Pavlova",
        issueMessage: "Missing field 'image'",
        severity: "ERROR",
      },
      {
        richResultType: "Recipes",
        itemName: "Lamingtons",
        issueMessage: "Missing field 'name' (in 'author')",
        severity: "WARNING",
      },
      {
        richResultType: "Breadcrumbs",
        itemName: "Home > Recipes",
        issueMessage: "Invalid 'position'",
        // Absent severity is reported as unspecified, not silently dropped.
        severity: "SEVERITY_UNSPECIFIED",
      },
    ]);
  });

  it("handles every level of the shape being absent", () => {
    expect(flattenRichResultIssues(undefined)).toEqual([]);
    expect(flattenRichResultIssues({ verdict: "PASS" })).toEqual([]);
    expect(
      flattenRichResultIssues({
        detectedItems: [{ richResultType: "Recipes" }],
      }),
    ).toEqual([]);
    expect(
      flattenRichResultIssues({ detectedItems: [{ items: [{ issues: [] }] }] }),
    ).toEqual([]);
  });

  it("names an untyped detected item rather than dropping its issues", () => {
    const issues = flattenRichResultIssues({
      detectedItems: [
        { items: [{ issues: [{ issueMessage: "Some issue" }] }] },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      richResultType: "Unknown",
      itemName: null,
    });
  });

  it("skips issues with no message", () => {
    const issues = flattenRichResultIssues({
      detectedItems: [
        {
          richResultType: "Recipes",
          items: [{ issues: [{ severity: "ERROR" }] }],
        },
      ],
    });
    expect(issues).toEqual([]);
  });
});
