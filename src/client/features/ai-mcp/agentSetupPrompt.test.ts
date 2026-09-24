import { describe, expect, it } from "vitest";
import { brand } from "@/shared/brand";
import { getAgentSetupPrompt } from "./agentSetupPrompt";

describe("agent setup prompt", () => {
  it("copies the installer body without its internal skill metadata", () => {
    const prompt = getAgentSetupPrompt(brand.appUrl);
    expect(prompt).toContain("Identify this agent and its version");
    expect(prompt).not.toContain("internal: true");
    expect(prompt).toContain(`${brand.docsUrl}/codex-plugin`);
    expect(prompt).toContain(`${brand.docsUrl}/skills/setup`);
    expect(prompt).toContain("whoami and list_projects");
  });
  it("uses the current instance for MCP and API keys while keeping public docs links", () => {
    const prompt = getAgentSetupPrompt("https://seo.example.com");
    expect(prompt).toContain("https://seo.example.com/mcp");
    expect(prompt).toContain("https://seo.example.com/settings");
    expect(prompt).not.toContain("{{");
    expect(prompt).toContain(`Set up ${brand.name} in this agent`);
    expect(prompt).toContain(`${brand.docsUrl}/mcp`);
  });
});
