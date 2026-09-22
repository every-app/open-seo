import { describe, expect, it } from "vitest";
import { buildSamSystemPrompt } from "./samSystemPrompt";

const project = {
  projectId: "p1",
  projectName: "Test",
  domain: "example.com",
  locationCode: 2724,
  languageCode: "es",
} as const;

describe("buildSamSystemPrompt replyLanguage", () => {
  it("injects the language section when replyLanguage is set", () => {
    const prompt = buildSamSystemPrompt(project, {
      intakeMode: false,
      replyLanguage: "Spanish",
    });
    expect(prompt).toContain("Always write your replies in Spanish");
  });

  it("omits the language section when replyLanguage is unset", () => {
    const prompt = buildSamSystemPrompt(project, { intakeMode: false });
    expect(prompt).not.toContain("Always write your replies");
  });

  it("keeps the intake flow hint when intakeMode is true", () => {
    const prompt = buildSamSystemPrompt(project, {
      intakeMode: true,
      replyLanguage: "Spanish",
    });
    expect(prompt).toContain("business_overview");
  });
});
