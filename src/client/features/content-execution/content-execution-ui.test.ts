import { describe, expect, it } from "vitest";
import { CONTENT_EXECUTION_STATUSES } from "@/types/content-execution";
import {
  getContentExecutionStatusLabel,
  getJiraIssueLabel,
} from "./content-execution-ui";

describe("content execution UI labels", () => {
  it("gives every persisted status a marketer-readable label", () => {
    expect(
      CONTENT_EXECUTION_STATUSES.map(getContentExecutionStatusLabel),
    ).toEqual([
      "Backlog",
      "Ready to assign",
      "Briefing",
      "Writing",
      "Review",
      "Ready to publish",
      "Published",
      "Blocked",
    ]);
  });

  it("uses the Jira key when present and a plain fallback otherwise", () => {
    expect(getJiraIssueLabel("SEO-101")).toBe("SEO-101");
    expect(getJiraIssueLabel(null)).toBe("Open Jira issue");
  });
});
