import { safeHostname } from "@/shared/safe-url";

// The chat app on the web an agent runs in, if any. Client names are
// self-reported; the redirect address is where the authorization code goes.
// Agents on the user's computer redirect to localhost or an app scheme.
export function getWebChat(redirectUris: string[]) {
  const hosts = redirectUris.map(safeHostname);
  if (hosts.includes("claude.ai")) return "claude" as const;
  if (hosts.includes("chatgpt.com")) return "chatgpt" as const;
  return null;
}
