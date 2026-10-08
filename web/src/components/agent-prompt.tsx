import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import {
  agentUpdatePrompt,
  getAgentSetupPrompt,
} from "../../../src/client/features/ai-mcp/agentSetupPrompt";

export function AgentPrompt({ kind }: { kind: "setup" | "update" }) {
  const prompt =
    kind === "setup"
      ? getAgentSetupPrompt("https://app.openseo.so")
      : agentUpdatePrompt;

  return (
    <CodeBlock
      title={kind === "setup" ? "Setup prompt" : "Update prompt"}
      viewportProps={{ className: "max-h-64" }}
    >
      <Pre className="whitespace-pre-wrap px-4">
        <code>{prompt}</code>
      </Pre>
    </CodeBlock>
  );
}
