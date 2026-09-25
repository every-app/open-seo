import { type UIMessage } from "ai";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Undo2,
} from "@/client/components/icons";
import { Markdown } from "@/client/components/Markdown";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";

// Shared chat-message rendering. A chat supplies which tools are available and
// how tool names become labels (resolveToolLabel) plus which message actions
// its server supports (onUndo/onEdit); the UI itself lives here.

type ToolLabel = { running: string; done: string };

// Maps a UIMessage tool part type (e.g. "tool-get_serp_results") to its label,
// or null to hide the badge entirely.
type ResolveToolLabel = (partType: string) => ToolLabel | null;

// Turn a tool part type ("tool-get_serp_results") into a readable label
// ("Get serp results"). Used for chats that expose too many tools to curate a
// per-tool label map by hand.
export function humanizeToolLabel(partType: string): ToolLabel {
  const name = partType.replace(/^tool-/, "").replace(/_/g, " ");
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return { running: label, done: label };
}

// activate_skill is the one tool where the target matters more than the tool
// name: surface which skill the agent loaded instead of a bare "Activate
// skill" badge.
function skillNameFromPart(part: UIMessage["parts"][number]): string | null {
  if (part.type !== "tool-activate_skill" || !("input" in part)) return null;
  const input: unknown = part.input;
  return typeof input === "object" &&
    input !== null &&
    "name" in input &&
    typeof input.name === "string"
    ? input.name
    : null;
}

// Whether an assistant message already shows something — visible text, reasoning,
// or a tool badge. Used to decide when the standalone typing indicator is still
// needed: a running tool badge already reads as progress, so the dots would
// double up.
export function messageHasVisibleContent(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      (part.type === "text" && part.text.trim().length > 0) ||
      (part.type === "reasoning" && part.text.trim().length > 0) ||
      part.type.startsWith("tool-"),
  );
}

// Plain text of a message for the clipboard: its visible text parts only (no
// reasoning traces, no tool payloads).
function messageText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function CopyButton({ message }: { message: UIMessage }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      aria-label="Copy message"
      title="Copy"
      className="size-7"
      onClick={() => {
        void navigator.clipboard.writeText(messageText(message));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

// Hover action bar under a message: copy for every message, undo/edit for user
// messages when the chat wires up the handlers (rewinding needs server support,
// so chats opt in per handler).
function MessageActions({
  message,
  onUndo,
  onStartEdit,
}: {
  message: UIMessage;
  onUndo?: () => void;
  onStartEdit?: () => void;
}) {
  return (
    <div
      className={`flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
        message.role === "user" ? "justify-end" : ""
      }`}
    >
      <CopyButton message={message} />
      {onStartEdit ? (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Edit message"
          title="Edit and resend"
          className="size-7"
          onClick={onStartEdit}
        >
          <Pencil className="size-3.5" />
        </Button>
      ) : null}
      {onUndo ? (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Undo from this message"
          title="Undo — remove this message and everything after it"
          className="size-7"
          onClick={onUndo}
        >
          <Undo2 className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

// Collapsible "thinking" block for the model's reasoning stream. Collapsed by
// default so the chain-of-thought doesn't bury the answer; while it's still
// streaming it doubles as the progress indicator ("Thinking…" + spinner).
function ReasoningBlock({
  part,
  live,
}: {
  part: Extract<UIMessage["parts"][number], { type: "reasoning" }>;
  live: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Persisted parts can keep a stale state:"streaming" (interrupted or
  // multi-segment turns), so only trust it while the message is actually
  // being generated — otherwise finished replies show hanging spinners.
  const isStreaming = live && part.state === "streaming";
  return (
    <div className="text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="h-auto gap-1.5 px-0 font-normal hover:bg-transparent"
      >
        {isStreaming ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <ChevronRight
            className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
        <span>{isStreaming ? "Thinking…" : "Thought process"}</span>
      </Button>
      {expanded ? (
        <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-border pl-3 text-xs text-muted-foreground">
          {part.text}
        </div>
      ) : null}
    </div>
  );
}

// A small inline badge for one tool call, rendered in document order inside the
// assistant bubble so the sequence of work stays visible after it completes.
function ToolBadge({
  part,
  live,
  resolveToolLabel,
}: {
  part: UIMessage["parts"][number];
  live: boolean;
  resolveToolLabel: ResolveToolLabel;
}) {
  const labels = resolveToolLabel(part.type);
  if (!labels) return null;
  const skillName = skillNameFromPart(part);
  const runningText = skillName ? `Activating ${skillName}` : labels.running;
  const doneText = skillName ? `Skill: ${skillName}` : labels.done;
  const state = "state" in part ? part.state : undefined;
  const isDone = state === "output-available";
  // A "running" part in a message that is no longer being generated never
  // finished — the turn was interrupted. Show it as failed, not spinning.
  const isError = state === "output-error" || (!isDone && !live);
  const isRunning = !isError && !isDone;
  return (
    <Badge
      size="lg"
      variant={isError ? "destructive" : "secondary"}
      className="w-fit font-normal"
    >
      {isRunning ? (
        <Loader2 className="size-3 animate-spin" />
      ) : isError ? (
        <AlertTriangle className="size-3" />
      ) : (
        <Check className="size-3" />
      )}
      <span>{isRunning ? `${runningText}…` : doneText}</span>
    </Badge>
  );
}

/**
 * One chat message bubble. User turns render as a right-aligned bubble;
 * assistant turns render each part (reasoning, markdown text, tool badges) in
 * document order, flush with the column. `resolveToolLabel` maps tool part
 * types to labels.
 *
 * Every settled message gets a hover copy button. User messages additionally
 * get undo (rewind the conversation to before this message) and edit (rewind,
 * then resend the edited text) when the chat passes the handlers — both need
 * server support, so chats opt in.
 */
export function ChatMessage({
  message,
  resolveToolLabel,
  streaming,
  onUndo,
  onEdit,
}: {
  message: UIMessage;
  resolveToolLabel: ResolveToolLabel;
  /** True while this message is still being generated: reasoning spinners
   * stay live and the hover actions (copy) are held back until it settles. */
  streaming?: boolean;
  onUndo?: () => void;
  onEdit?: (newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (message.role === "user") {
    if (editing && onEdit) {
      const submit = () => {
        const text = draft.trim();
        setEditing(false);
        if (text && text !== messageText(message)) onEdit(text);
      };
      return (
        <div className="flex flex-col items-end gap-1.5 pl-8 sm:pl-16">
          <Textarea
            className="max-w-xl"
            rows={Math.min(6, Math.max(2, draft.split("\n").length))}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
              if (event.key === "Escape") setEditing(false);
            }}
          />
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-7 px-2.5"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              className="h-7 px-2.5"
              onClick={submit}
            >
              Save & resend
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="group flex flex-col gap-1">
        <div className="flex justify-end pl-8 sm:pl-16">
          <div className="rounded-2xl rounded-br-md bg-primary/20 px-4 py-2.5 text-sm text-foreground">
            {message.parts.map((part, index) =>
              part.type === "text" ? (
                <span key={index} className="whitespace-pre-wrap">
                  {part.text}
                </span>
              ) : null,
            )}
          </div>
        </div>
        <MessageActions
          message={message}
          onUndo={onUndo}
          onStartEdit={
            onEdit
              ? () => {
                  setDraft(messageText(message));
                  setEditing(true);
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-1">
      <div className="min-w-0 space-y-2 text-sm">
        {message.parts.map((part, index) => {
          if (part.type === "reasoning") {
            return part.text.trim() ? (
              <ReasoningBlock
                key={index}
                part={part}
                live={Boolean(streaming)}
              />
            ) : null;
          }
          if (part.type === "text") {
            return part.text.trim() ? (
              <Markdown key={index}>{part.text}</Markdown>
            ) : null;
          }
          if (part.type.startsWith("tool-")) {
            return (
              <ToolBadge
                key={index}
                part={part}
                live={Boolean(streaming)}
                resolveToolLabel={resolveToolLabel}
              />
            );
          }
          return null;
        })}
      </div>
      {streaming ? null : <MessageActions message={message} />}
    </div>
  );
}
