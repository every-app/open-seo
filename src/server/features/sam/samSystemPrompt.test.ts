import { describe, expect, it } from "vitest";
import { buildSamSystemPrompt } from "./samSystemPrompt";

const project = {
  projectId: "p1",
  projectName: "Test",
  domain: "example.com",
  locationCode: 2854,
  languageCode: "en",
};

const TIMEOUT_SENTENCE =
  "The audit is still running and did not finish within the available agent window.";

describe("buildSamSystemPrompt — long-running tool protocol", () => {
  const prompt = buildSamSystemPrompt(project, { memoryIsEmpty: false });

  it("teaches the START vs FINAL RESULT distinction", () => {
    expect(prompt).toMatch(/only asked to START an audit/);
    expect(prompt).toMatch(/starting it and reporting the audit id is a complete answer/);
    expect(prompt).toMatch(/those are REQUIRED/);
  });

  it("forbids answering from partial progress", () => {
    expect(prompt).toMatch(/partial progress is not a result/);
    expect(prompt).toMatch(/never invent page counts or issues/);
  });

  it("pins the exact timeout copy", () => {
    expect(prompt).toContain(TIMEOUT_SENTENCE);
  });

  it("routes waiting through poll_site_audit and results to the read tools", () => {
    expect(prompt).toContain("poll_site_audit");
    expect(prompt).toContain("get_audit_issues");
  });
});
