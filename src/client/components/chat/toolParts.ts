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
    if (!isToolPart(part)) continue; // breaks nothing here; see buildRenderPlan
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
 *
 * The group is built in the SAME pass that emits it (not by consuming an
 * independently-indexed group list): indexing into a separately built list
 * desynced when the same tool type recurred after a non-tool part —
 * groupConsecutiveToolParts merges those into one group (it skips non-tool
 * parts), while the old first-of-run detection here counted two runs,
 * leaving the second `groups[i]` undefined and crashing ToolBadge on
 * `group.type`. Single-pass construction keeps the emission and the group
 * referentially locked together for every sequence, including
 * [tool-A, reasoning, tool-A].
 */
export function buildRenderPlan(parts: unknown): RenderPlanEntry[] {
  const safe = safeParts(parts);
  const plan: RenderPlanEntry[] = [];
  let currentGroup: ToolPartGroup | null = null;
  for (const part of safe) {
    if (!isToolPart(part)) {
      // Any non-tool part breaks the current run (document order matters:
      // two same-type calls around text are distinct work, and merging them
      // would collapse the timeline between them).
      currentGroup = null;
      plan.push({ kind: "part", part });
      continue;
    }
    if (currentGroup && currentGroup.type === part.type) {
      currentGroup.parts.push(part);
      currentGroup.last = part;
      continue;
    }
    currentGroup = { type: part.type, parts: [part], last: part };
    plan.push({ kind: "tools", group: currentGroup });
  }
  return plan;
}

/** Best-effort read of a tool part's structured output object. */
export function toolPartOutput(part: ChatToolPart): Record<string, unknown> | null {
  if (!("output" in part)) return null;
  return isRecord(part.output) ? part.output : null;
}
