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
} from "lucide-react";
import { Markdown } from "@/client/components/Markdown";

// Shared rendering for the chat agents (onboarding + SAM). The chats differ
// only in which tools are available and how tool names become labels
// (resolveToolLabel) plus which message actions their server supports
// (onUndo/onEdit); the UI itself is identical and lives here.

export type ToolLabel = { running: string; done: string };

// Maps a UIMessage tool part type (e.g. "tool-get_serp_results") to its label,
// or null to hide the badge entirely (onboarding hides tools it hasn't curated).
export type ResolveToolLabel = (partType: string) => ToolLabel | null;

// Turn a tool part type ("tool-get_serp_results") into a readable label
// ("Get serp results"). Used for chats that expose too many tools to curate a
// per-tool label map by hand.
export function humanizeToolLabel(partType: string): ToolLabel {
  const name = partType.replace(/^tool-/, "").replace(/_/g, " ");
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return { running: label, done: label };
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
    <button
      type="button"
      aria-label="Copy message"
      title="Copy"
      className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
      onClick={() => {
        void navigator.clipboard.writeText(messageText(message));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
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
        <button
          type="button"
          aria-label="Edit message"
          title="Edit and resend"
          className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          onClick={onStartEdit}
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
      {onUndo ? (
        <button
          type="button"
          aria-label="Undo from this message"
          title="Undo — remove this message and everything after it"
          className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          onClick={onUndo}
        >
          <Undo2 className="size-3.5" />
        </button>
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
    <div className="text-base-content/60">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="inline-flex items-center gap-1.5 text-xs hover:text-base-content/80"
      >
        {isStreaming ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <ChevronRight
            className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
        <span>{isStreaming ? "Thinking…" : "Thought process"}</span>
      </button>
      {expanded ? (
        <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-base-300 pl-3 text-xs text-base-content/50">
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
  const state = "state" in part ? part.state : undefined;
  const isDone = state === "output-available";
  // A "running" part in a message that is no longer being generated never
  // finished — the turn was interrupted. Show it as failed, not spinning.
  const isError = state === "output-error" || (!isDone && !live);
  const isRunning = !isError && !isDone;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        isError ? "bg-error/10 text-error" : "bg-base-200 text-base-content/70"
      }`}
    >
      {isRunning ? (
        <Loader2 className="size-3 animate-spin" />
      ) : isError ? (
        <AlertTriangle className="size-3" />
      ) : (
        <Check className="size-3" />
      )}
      <span>{isRunning ? `${labels.running}…` : labels.done}</span>
    </span>
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
          <textarea
            className="textarea textarea-bordered w-full max-w-xl text-sm"
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
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={submit}
            >
              Save & resend
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="group flex flex-col gap-1">
        <div className="flex justify-end pl-8 sm:pl-16">
          <div className="rounded-box rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-content">
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
