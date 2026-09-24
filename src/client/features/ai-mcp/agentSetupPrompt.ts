import installerSkill from "../../../../.agents/skills/setup-seoshark/SKILL.md?raw";
import updatePrompt from "./agentUpdatePrompt.md?raw";
import { brand } from "@/shared/brand";

const skillsSourceUrl = brand.githubUrl
  ? `${brand.githubUrl}/tree/main/plugins/seoshark/skills`
  : `${brand.docsUrl}/agent-setup`;

export const agentUpdatePrompt = updatePrompt
  .trim()
  .replaceAll("{{brandName}}", brand.name)
  .replaceAll("{{docsUrl}}", brand.docsUrl)
  .replaceAll("{{skillsSourceUrl}}", skillsSourceUrl);

// The copyable installer and internal skill share one source of truth.
export function getAgentSetupPrompt(origin: string) {
  const instructions = installerSkill
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .trim();
  return instructions
    .replaceAll("{{appUrl}}", origin)
    .replaceAll("{{brandName}}", brand.name)
    .replaceAll("{{docsUrl}}", brand.docsUrl);
}
