import type { UIMessage } from "ai";

// Session-title derivation for SAM, extracted from SamChatAgent so the DO
// file stays under the lint line budget.

/** Derive a short session title from the first user message. */
export function deriveTitle(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "New chat";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export function firstUserText(messages: UIMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  // A failed turn can persist malformed part entries — never assume shape.
  for (const part of firstUser?.parts ?? []) {
    if (
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      return part.text;
    }
  }
  return "";
}
