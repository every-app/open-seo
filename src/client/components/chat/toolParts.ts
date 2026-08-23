import type { UIMessage } from "ai";

// Pure helpers for rendering tool-call parts of a chat message. Extracted from
// ChatMessage.tsx so they can be unit-tested without React.

type MessagePart = UIMessage["parts"][number];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrow one message part to its tool variant by its `tool-` prefix. */
export function isToolPart(part: MessagePart): part is ChatToolPart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    typeof part.type === "string" &&
    part.type.startsWith("tool-")
  );
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

export type ChatToolPart = Extract<MessagePart, { type: `tool-${string}` }>;

export type ToolPartGroup = {
  type: string;
  /** Every consecutive part in the group, in document order. */
  parts: ChatToolPart[];
  /** The most recent part in the group — its state/output wins for display. */
  last: ChatToolPart;
};

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
  for (const part of safe) {
    if (!isToolPart(part)) continue;
    const group = groups[groups.length - 1];
    if (group && group.type === part.type) {
      group.parts.push(part);
      group.last = part;
    } else {
      groups.push({ type: part.type, parts: [part], last: part });
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
 */
export function buildRenderPlan(parts: unknown): RenderPlanEntry[] {
  const safe = safeParts(parts);
  const groups = groupConsecutiveToolParts(safe);
  const plan: RenderPlanEntry[] = [];
  let groupIndex = 0;
  for (let i = 0; i < safe.length; i++) {
    const part = safe[i];
    if (!part) continue;
    if (isToolPart(part)) {
      // Only the FIRST part of each same-type run emits the group entry.
      const previous = i > 0 ? safe[i - 1] : undefined;
      if (!previous || !isToolPart(previous) || previous.type !== part.type) {
        plan.push({ kind: "tools", group: groups[groupIndex] });
        groupIndex++;
      }
      continue;
    }
    plan.push({ kind: "part", part });
  }
  return plan;
}

/** Best-effort read of a tool part's structured output object. */
export function toolPartOutput(part: ChatToolPart): Record<string, unknown> | null {
  if (!("output" in part)) return null;
  return isRecord(part.output) ? part.output : null;
}
