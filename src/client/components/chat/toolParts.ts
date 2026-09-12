import type { UIMessage } from "ai";

// Pure helpers for rendering tool-call parts of a chat message. Extracted from
// ChatMessage.tsx so they can be unit-tested without React.

type MessagePart = UIMessage["parts"][number];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type ChatToolPart =
  | Extract<MessagePart, { type: `tool-${string}` }>
  | Extract<MessagePart, { type: "dynamic-tool" }>;

/** Narrow one message part to its tool variant (supports both `tool-*` and `dynamic-tool`). */
export function isToolPart(part: MessagePart): part is ChatToolPart {
  if (typeof part !== "object" || part === null || !("type" in part)) {
    return false;
  }
  if (typeof part.type !== "string") return false;
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

/** Get the normalized tool type identifier (e.g. `tool-research_keywords`). */
export function getToolPartType(part: ChatToolPart): string {
  if (part.type === "dynamic-tool" && "toolName" in part && typeof part.toolName === "string") {
    return `tool-${part.toolName}`;
  }
  return part.type;
}

/** Get the bare tool name without `tool-` prefix (e.g. `research_keywords`). */
export function getToolPartName(part: ChatToolPart): string {
  if (part.type === "dynamic-tool" && "toolName" in part && typeof part.toolName === "string") {
    return part.toolName;
  }
  return part.type.replace(/^tool-/, "");
}

/**
 * A provider failure mid-turn can persist or stream a message whose `parts`
 * array contains null/undefined/malformed entries. Nothing invalid may reach
 * the renderer unchecked — every consumer filters through this first.
 */
export function safeParts(parts: unknown): MessagePart[] {
  const list: unknown[] = Array.isArray(parts) ? parts : [];
  return list.filter((part): part is MessagePart => {
    if (typeof part !== "object" || part === null) return false;
    if (!("type" in part)) return false;
    return typeof part.type === "string";
  });
}

export type ToolPartGroup = {
  type: string;
  /** Every consecutive part in the group, in document order. */
  parts: ChatToolPart[];
  /** The most recent part in the group — its state/output wins for display. */
  last: ChatToolPart;
};

/** Best-effort read of a tool part's structured output object. */
export function toolPartOutput(part: ChatToolPart): Record<string, unknown> | null {
  if (!("output" in part)) return null;
  return isRecord(part.output) ? part.output : null;
}

/**
 * Check if a tool part represents an internal recovery retry that was blocked
 * by the duplicate-call gate.
 */
export function isBlockedToolPart(part: ChatToolPart): boolean {
  const output = toolPartOutput(part);
  if (!output) return false;
  if (output.recoveryBlocked === true) return true;
  if (typeof output.error === "string") {
    return (
      output.error.includes("unavailable for this turn") ||
      output.error.includes("Do not retry again in this turn") ||
      output.error.includes("Do not retry it in this turn")
    );
  }
  return false;
}

/** Check if a tool part represents a failed tool execution or failure outcome. */
export function isToolPartFailed(part: ChatToolPart): boolean {
  if (!("state" in part)) return false;
  if (part.state === "output-error") return true;
  if (part.state === "output-available") {
    const output = toolPartOutput(part);
    if (output) {
      if (typeof output.recoveryNotice === "string" && output.recoveryNotice.length > 0) {
        return true;
      }
      if (typeof output.error === "string" && output.error.length > 0) {
        return true;
      }
      if (output.state === "failed") {
        return true;
      }
      if (output.ok === false && !("results" in output)) {
        return true;
      }
    }
  }
  return false;
}

/** Extract a user-friendly failure detail string for tool badges in chat. */
export function getToolFailureDetail(part: ChatToolPart): string | null {
  const output = toolPartOutput(part);
  const text =
    (output && typeof output.recoveryNotice === "string" && output.recoveryNotice) ||
    (output && typeof output.error === "string" && output.error) ||
    ("errorText" in part && typeof part.errorText === "string" && part.errorText) ||
    "";

  if (!text) return null;

  if (/credits? unavailable|insufficient credits|payment required|HTTP_402/i.test(text)) {
    return "Credits unavailable — using fallback";
  }
  if (/rate.?limit/i.test(text)) {
    return "Rate limited — using fallback";
  }
  if (/temporary error|transient/i.test(text)) {
    return "Temporary error — using fallback";
  }
  if (/unavailable \(configuration or capability/i.test(text)) {
    return "Unavailable — using fallback";
  }
  if (/invalid.*arguments|tool-input/i.test(text)) {
    return "Invalid arguments";
  }
  return null;
}

/**
 * Merge runs of CONSECUTIVE same-type tool parts into single display groups.
 * Polling loops (e.g. repeated get_audit_status while an audit runs) collapse
 * into one badge instead of a wall of identical rows; non-consecutive calls
 * stay separate because document order carries meaning there. Reasoning/text
 * parts break a run like any other part type.
 */
export function groupConsecutiveToolParts(
  parts: unknown,
): ToolPartGroup[] {
  const safe = safeParts(parts);
  const groups: ToolPartGroup[] = [];
  const seenTypes = new Set<string>();

  for (const part of safe) {
    if (!isToolPart(part)) continue;
    const partType = getToolPartType(part);
    const isBlocked = isBlockedToolPart(part);

    // If an internal retry was blocked, and we have already seen this tool,
    // do not add it or increment counts.
    if (isBlocked && seenTypes.has(partType)) {
      continue;
    }

    const group = groups[groups.length - 1];
    if (group && group.type === partType) {
      if (!isBlocked) {
        group.parts.push(part);
        group.last = part;
      }
    } else {
      groups.push({ type: partType, parts: [part], last: part });
      seenTypes.add(partType);
    }
  }
  return groups;
}

export type RenderPlanEntry =
  | { kind: "part"; part: MessagePart }
  | { kind: "tools"; group: ToolPartGroup };

/**
 * Document-order render plan: every non-tool part passes through untouched;
 * each run of consecutive same-type tool parts collapses into one group
 * entry. This is what the chat bubble renders so interleaved
 * reasoning → tools → text sequences keep their original order.
 *
 * Blocked internal retries (which recovery gate stops from executing) are
 * prevented from creating duplicate badges or inflating legitimate execution counts.
 */
export function buildRenderPlan(parts: unknown): RenderPlanEntry[] {
  const safe = safeParts(parts);
  const plan: RenderPlanEntry[] = [];
  let currentGroup: ToolPartGroup | null = null;
  const seenToolTypes = new Set<string>();

  for (const part of safe) {
    if (!isToolPart(part)) {
      // Any non-tool part breaks the current run (document order matters:
      // two same-type calls around text are distinct work, and merging them
      // would collapse the timeline between them).
      currentGroup = null;
      plan.push({ kind: "part", part });
      continue;
    }

    const partType = getToolPartType(part);
    const isBlocked = isBlockedToolPart(part);

    // If an internal retry was blocked, and this tool was already initiated/shown:
    // absorb it so normal chat does not duplicate badges or inflate legitimate execution counts.
    if (isBlocked && (seenToolTypes.has(partType) || (currentGroup && currentGroup.type === partType))) {
      continue;
    }

    if (currentGroup && currentGroup.type === partType) {
      if (!isBlocked) {
        currentGroup.parts.push(part);
        currentGroup.last = part;
      }
      continue;
    }

    currentGroup = { type: partType, parts: [part], last: part };
    seenToolTypes.add(partType);
    plan.push({ kind: "tools", group: currentGroup });
  }
  return plan;
}
