import type { UIMessage } from "ai";

// Transcript sanitization for the SAM chat agent.
//
// A provider failure mid-turn can persist null/undefined/malformed message or
// part entries in Think's session storage. Think serves BOTH client-facing
// transcript reads straight off the `this.messages` getter without ever
// calling `getMessages()`: the /get-messages HTTP endpoint (its onRequest
// wrapper short-circuits with `Response.json(this.messages)`) and the
// WebSocket reconnect replay (`_buildIdleConnectMessages`). The agents/chat
// client then loops over `message.parts` unguarded (e.g.
// `collapseHydratedReplayTextParts`) and a malformed entry crashes the
// browser with "Cannot read properties of undefined (reading 'type')".
// SamChatAgent overrides the `messages` getter to run everything through
// `sanitizeTranscript`, which makes that getter the single choke point for
// every egress (HTTP, WS replay, `getMessages()`) and for server-side readers
// like title derivation.

type MessagePart = UIMessage["parts"][number];

function isValidPart(part: unknown): part is MessagePart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    typeof part.type === "string"
  );
}

/** Object with a string role — the minimum shape the client hooks can read. */
function hasMessageShape(message: unknown): message is UIMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    typeof message.role === "string"
  );
}

function isCleanMessage(message: UIMessage): boolean {
  return Array.isArray(message.parts) && message.parts.every(isValidPart);
}

/** Whole-transcript type guard: powers the allocation-free fast path. */
function isCleanTranscript(messages: unknown): messages is UIMessage[] {
  return (
    Array.isArray(messages) &&
    messages.every(
      (message) => hasMessageShape(message) && isCleanMessage(message),
    )
  );
}

// One message with a guaranteed, filtered parts array. Returns the same
// reference when nothing needs dropping.
function cleanMessage(message: UIMessage): UIMessage {
  if (!Array.isArray(message.parts)) return { ...message, parts: [] };
  const parts: unknown[] = message.parts;
  if (parts.every(isValidPart)) return message;
  return { ...message, parts: parts.filter(isValidPart) };
}

/**
 * Drop invalid messages (non-object / missing string role) and invalid parts
 * (non-object / missing string `type`) from a transcript. A transcript that
 * is already clean returns the SAME array reference, so this is
 * allocation-free on the hot path (the getter is read constantly by Think
 * internals). Every message that survives gets a parts array.
 */
export function sanitizeTranscript(messages: unknown): UIMessage[] {
  if (isCleanTranscript(messages)) return messages;
  const list: unknown[] = Array.isArray(messages) ? messages : [];
  const result: UIMessage[] = [];
  for (const raw of list) {
    if (hasMessageShape(raw)) result.push(cleanMessage(raw));
  }
  return result;
}
