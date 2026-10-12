import { describe, expect, it } from "vitest";
import { getAgentSetupPrompt } from "./agentSetupPrompt";

describe("agent setup prompt", () => {
  it("uses the current instance for MCP and API keys while keeping public docs links", () => {
    const prompt = getAgentSetupPrompt("https://seo.example.com");
    expect(prompt).toContain("https://seo.example.com/mcp");
    expect(prompt).toContain("https://seo.example.com/settings");
    expect(prompt).not.toContain("https://app.openseo.so");
    expect(prompt).toContain("https://openseo.so/docs/mcp");
    expect(prompt).not.toContain("internal: true");
  });
});
