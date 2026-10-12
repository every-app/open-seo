import { type UIMessage } from "ai";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Pencil,
  Undo2,
} from "lucide-react";
import { CopyButton } from "@/client/components/CopyButton";
import { Markdown } from "@/client/components/Markdown";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";

// Turn a tool part type ("tool-get_serp_results") into a readable label
// ("Get serp results"). SAM exposes the full MCP tool surface, too many tools
// to curate a per-tool label map by hand.
function humanizeToolLabel(partType: string): string {
  const name = partType.replace(/^tool-/, "").replace(/_/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
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
      className={`flex gap-0.5 text-muted-foreground reveal-on-hover ${
        message.role === "user" ? "justify-end" : ""
      }`}
    >
      <CopyButton
        value={messageText(message)}
        successMessage="Message copied"
        label="Copy message"
        variant="ghost"
        size="icon-xs"
      />
      {onStartEdit ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Edit message"
          title="Edit and resend"
          onClick={onStartEdit}
        >
          <Pencil />
        </Button>
      ) : null}
      {onUndo ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Undo from this message"
          title="Undo — remove this message and everything after it"
          onClick={onUndo}
        >
          <Undo2 />
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
  // Persisted parts can keep a stale state:"streaming" (interrupted or
  // multi-segment turns), so only trust it while the message is actually
  // being generated — otherwise finished replies show hanging spinners.
  const isStreaming = live && part.state === "streaming";
  return (
    <Collapsible className="text-muted-foreground">
      <CollapsibleTrigger className="group inline-flex items-center gap-1.5 rounded-sm text-xs outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        {isStreaming ? (
          <Spinner className="size-3" />
        ) : (
          <ChevronRight className="size-3 transition-transform group-data-panel-open:rotate-90" />
        )}
        <span>{isStreaming ? "Thinking…" : "Thought process"}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 whitespace-pre-wrap border-l-2 border-border pl-3 text-xs">
        {part.text}
      </CollapsibleContent>
    </Collapsible>
  );
}

// A small inline badge for one tool call, rendered in document order inside the
// assistant bubble so the sequence of work stays visible after it completes.
function ToolBadge({
  part,
  live,
}: {
  part: UIMessage["parts"][number];
  live: boolean;
}) {
  const label = humanizeToolLabel(part.type);
  const skillName = skillNameFromPart(part);
  const runningText = skillName ? `Activating ${skillName}` : label;
  const doneText = skillName ? `Skill: ${skillName}` : label;
  const state = "state" in part ? part.state : undefined;
  const isDone = state === "output-available";
  // A "running" part in a message that is no longer being generated never
  // finished — the turn was interrupted. Show it as failed, not spinning.
  const isError = state === "output-error" || (!isDone && !live);
  const isRunning = !isError && !isDone;
  return (
    <Badge
      variant={isError ? "destructive" : "secondary"}
      className="h-6 px-2.5 font-normal"
    >
      {isRunning ? <Spinner /> : isError ? <AlertTriangle /> : <Check />}
      {isRunning ? `${runningText}…` : doneText}
    </Badge>
  );
}

/**
 * One chat message bubble. User turns render as a right-aligned bubble;
 * assistant turns render each part (reasoning, markdown text, tool badges) in
 * document order, flush with the column.
 *
 * Every settled message gets a hover copy button. User messages additionally
 * get undo (rewind the conversation to before this message) and edit (rewind,
 * then resend the edited text) when the chat passes the handlers — both need
 * server support, so chats opt in.
 */
export function ChatMessage({
  message,
  streaming,
  onUndo,
  onEdit,
}: {
  message: UIMessage;
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
            className="max-h-36 max-w-xl"
            // Browsers without CSS field-sizing size the box from `rows`.
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
            <Button variant="ghost" size="xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="xs" onClick={submit}>
              Save & resend
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="group flex flex-col gap-1">
        <div className="flex justify-end pl-8 sm:pl-16">
          <div className="rounded-xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
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
              <ToolBadge key={index} part={part} live={Boolean(streaming)} />
            );
          }
          return null;
        })}
      </div>
      {streaming ? null : <MessageActions message={message} />}
    </div>
  );
}
