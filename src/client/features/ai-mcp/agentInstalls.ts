import { ClaudeIcon, OpenAIIcon } from "./AgentIcons";

// newChatUrl opens a new chat with the prompt filled in. Neither link is
// documented by its chat app.
export const ONE_CLICK_INSTALLS = [
  {
    agent: "chatgpt",
    name: "ChatGPT",
    href: "https://chatgpt.com/plugins/plugin_asdk_app_6abddd2c7e4c819191f1398c4bd8e9b3",
    newChatUrl: (prompt: string) =>
      `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`,
    Icon: OpenAIIcon,
  },
  {
    agent: "claude",
    name: "Claude",
    href: "https://claude.com/marketplace/connectors/openseo",
    newChatUrl: (prompt: string) =>
      `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
    Icon: ClaudeIcon,
  },
];
