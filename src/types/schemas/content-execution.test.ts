import { describe, expect, it } from "vitest";
import {
  createContentExecutionItemSchema,
  updateContentExecutionItemSchema,
} from "./content-execution";

describe("content execution schemas", () => {
  it("accepts one page-level item with a primary keyword in its cluster", () => {
    const result = createContentExecutionItemSchema.parse({
      projectId: "project_1",
      title: "  Meta Conversions API solution page  ",
      targetUrl:
        "https://www.customerlabs.com/first-party-data-ops/conversions-api/",
      savedKeywordIds: ["kw_primary", "kw_variant"],
      primarySavedKeywordId: "kw_primary",
      owner: "  Maya  ",
      dueDate: "2026-09-12",
      jiraIssueKey: "SEO-101",
      jiraIssueUrl: "https://customerlabs.atlassian.net/browse/SEO-101",
    });

    expect(result).toMatchObject({
      title: "Meta Conversions API solution page",
      owner: "Maya",
      primarySavedKeywordId: "kw_primary",
    });
  });

  it("rejects a primary keyword outside the selected cluster", () => {
    const result = createContentExecutionItemSchema.safeParse({
      projectId: "project_1",
      title: "Meta Conversions API solution page",
      savedKeywordIds: ["kw_variant"],
      primarySavedKeywordId: "kw_primary",
    });

    expect(result.success).toBe(false);
  });

  it("keeps one write below the D1 parameter ceiling", () => {
    const savedKeywordIds = Array.from(
      { length: 81 },
      (_, index) => `kw_${index}`,
    );
    const result = createContentExecutionItemSchema.safeParse({
      projectId: "project_1",
      title: "Oversized keyword cluster",
      savedKeywordIds,
      primarySavedKeywordId: savedKeywordIds[0],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an update with no changed fields", () => {
    const result = updateContentExecutionItemSchema.safeParse({
      projectId: "project_1",
      executionItemId: "item_1",
    });

    expect(result.success).toBe(false);
  });
});
