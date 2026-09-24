import {
  ClaudeIcon,
  GrokIcon,
  HermesIcon,
  OpenAIIcon,
  OpenClawIcon,
} from "./AgentIcons";

const AGENTS = [
  { name: "Claude Code", Icon: ClaudeIcon },
  { name: "ChatGPT", Icon: OpenAIIcon },
  { name: "Grok Bot", Icon: GrokIcon },
  { name: "Hermes", Icon: HermesIcon },
  { name: "OpenClaw", Icon: OpenClawIcon },
];

export function AgentList() {
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      {AGENTS.map(({ name, Icon }) => (
        <li
          key={name}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Icon className="size-4" />
          {name}
        </li>
      ))}
      <li className="text-xs text-muted-foreground/70">or any MCP client</li>
    </ul>
  );
}
