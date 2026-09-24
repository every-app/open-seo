import { useAgent } from "agents/react";
// Think speaks the same chat protocol as @cloudflare/ai-chat, but its hook
// variant skips the client->server transcript sync Think doesn't support.
import { useAgentChat } from "@cloudflare/think/react";
import { useEffect, useRef } from "react";
import { RotateCcw } from "@/client/components/icons";
import { findLast } from "remeda";
import { ChatComposer } from "@/client/features/sam/ChatComposer";
import { invalidateSamSessions } from "@/client/features/sam/samQueries";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  ChatMessage,
  humanizeToolLabel,
  messageHasVisibleContent,
} from "@/client/components/chat/ChatMessage";
import { useStickToBottom } from "@/client/components/chat/useStickToBottom";

import { Button } from "@/client/components/ui/button";
const SUGGESTIONS = [
  "What keywords should I focus on next?",
  "Who are my top SERP competitors?",
  "How is my Search Console traffic trending?",
  "Find quick-win keywords I already rank for",
];

export function SamConversation({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  // The conversation lives in the SamChatAgent Durable Object, keyed by the
  // session id. The WebSocket is authorized in the Worker (src/server.ts) before
  // it reaches the DO; billing gates come back as normal assistant messages.
  const agent = useAgent({ agent: "sam-chat", name: sessionId });
  // SAM streams dense tool-input deltas; unthrottled per-chunk store fanout
  // re-renders the transcript per delta and trips React #185 (cloudflare/agents#1361).
  const {
    messages,
    sendMessage,
    setMessages,
    clearHistory,
    status,
    stop,
    isRecovering,
    connectionError,
  } = useAgentChat({ agent, experimental_throttle: 50 });

  // isRecovering: the DO is settling a turn a reset interrupted (persisting
  // the partial reply). Nothing can be sent into it until that lands.
  const isBusy =
    status === "submitted" || status === "streaming" || isRecovering;
  const { scrollRef, onScroll, pinToBottom } = useStickToBottom(
    messages,
    status,
  );
  // Client-side send counts, to set against the server's sam:turn events: a
  // send with no matching turn is a message that never reached the DO.
  const sendText = (
    text: string,
    source: "composer" | "suggestion" | "edit" | "retry" = "composer",
  ) => {
    pinToBottom();
    captureClientEvent("sam:message_send", {
      session_id: sessionId,
      project_id: projectId,
      source,
      chars: text.length,
    });
    void sendMessage({ text });
  };

  // What the user sees as a failure: the turn-level error banner below, or
  // the socket dropping (code/reason from the close frame). The server side
  // of the same failure is the sam:turn event with status "error".
  useEffect(() => {
    if (status !== "error" && !connectionError) return;
    captureClientEvent("sam:client_error", {
      session_id: sessionId,
      project_id: projectId,
      kind: connectionError ? "connection" : "turn",
      code: connectionError?.code,
      reason: connectionError?.reason,
    });
  }, [status, connectionError, sessionId, projectId]);

  // Rewind the server-side conversation to before `messageId`: the DO aborts
  // any in-flight turn, then deletes the message and everything after it. Sync
  // the local view from the server afterwards rather than slicing locally —
  // an aborted turn may have persisted (or removed) more than we can see, and
  // on Think setMessages is local-only, so this is a pure view update.
  const rewindTo = async (messageId: string) => {
    const response = await fetch(`/agents/sam-chat/${sessionId}/rewind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (!response.ok) return false;
    const fresh = await fetch(
      `/agents/sam-chat/${sessionId}/get-messages`,
    ).then((res) => (res.ok ? res.json() : null));
    if (Array.isArray(fresh)) setMessages(fresh);
    return true;
  };

  const undoFrom = (messageId: string) => void rewindTo(messageId);
  const editAndResend = async (
    messageId: string,
    newText: string,
    source: "edit" | "retry" = "edit",
  ) => {
    if (await rewindTo(messageId)) sendText(newText, source);
  };
  // Retry after a failed turn goes through the same rewind-then-resend path
  // as edit, so the failed partial reply is deleted server-side before the
  // new one streams in. Each click is one human-gated turn, metered per step;
  // the DO never re-runs a turn on its own (see onChatRecovery).
  const lastUserMessage = findLast(messages, (m) => m.role === "user");
  const retryLast = () => {
    if (!lastUserMessage) return;
    const text = lastUserMessage.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    void editAndResend(lastUserMessage.id, text, "retry");
  };

  // The DO names the session from its first message during the turn, so refresh
  // the side-panel once the turn settles (busy -> idle) to pick up the title.
  const wasBusyRef = useRef(false);
  useEffect(() => {
    if (isBusy) {
      wasBusyRef.current = true;
      return;
    }
    if (wasBusyRef.current) {
      wasBusyRef.current = false;
      invalidateSamSessions(projectId);
    }
  }, [isBusy, projectId]);

  const lastMessage = messages[messages.length - 1];
  const showTyping =
    isBusy &&
    (lastMessage?.role !== "assistant" ||
      !messageHasVisibleContent(lastMessage));
  const showSuggestions = messages.length === 0 && !isBusy;

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      {import.meta.env.DEV ? (
        // Dev-only escape hatch: wipes this session's persisted transcript on
        // the server (Think's cf_agent_chat_clear), for testing fresh-session
        // behavior without creating a new chat.
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-7 px-2.5 absolute right-3 top-2 z-10 text-muted-foreground"
          onClick={() => clearHistory()}
        >
          Clear history (dev)
        </Button>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-5 py-6"
      >
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 ? (
            <div className="space-y-2 text-sm text-foreground">
              <p>
                Hey, I’m SAM — your in-app SEO agent. I can research keywords,
                size up competitors, read your SERPs, backlinks, rank tracking
                and Search Console, and turn it into next steps for this
                project.
              </p>
              <p>Ask me anything, or start with one of these:</p>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              // SAM exposes the full MCP tool surface (~19 tools), too many to
              // hand-label, so tool names are humanized generically rather
              // than kept in a curated label map.
              resolveToolLabel={humanizeToolLabel}
              streaming={
                isBusy &&
                index === messages.length - 1 &&
                message.role === "assistant"
              }
              onUndo={
                // Allowed even mid-turn: rewind aborts the in-flight turn
                // server-side, so undo doubles as "stop and take it back".
                message.role === "user" ? () => undoFrom(message.id) : undefined
              }
              onEdit={
                message.role === "user"
                  ? (newText) => void editAndResend(message.id, newText)
                  : undefined
              }
            />
          ))}

          {showTyping ? (
            <div className="flex items-center gap-2 pt-1 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </span>
            </div>
          ) : null}

          {isRecovering ? (
            <p className="text-xs text-muted-foreground">
              Saving the reply that got cut off…
            </p>
          ) : null}

          {status === "error" ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-negative">
              <span>SAM stopped before finishing this reply.</span>
              {lastUserMessage ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="text-negative h-7 px-2.5 gap-1"
                  disabled={isBusy}
                  onClick={retryLast}
                >
                  <RotateCcw className="size-3" />
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}

          {showSuggestions ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((question) => (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  key={question}
                  className="h-auto whitespace-normal rounded-full py-1.5 text-left font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => sendText(question, "suggestion")}
                >
                  {question}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-border px-5 py-3">
        <div className="mx-auto w-full max-w-2xl">
          <ChatComposer
            busy={isBusy}
            onSend={sendText}
            onStop={() => void stop()}
            placeholder="Ask SAM to research, analyze, or track anything…"
          />
        </div>
      </div>
    </div>
  );
}
