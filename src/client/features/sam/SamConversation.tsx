import { useAgent } from "agents/react";
// Think speaks the same chat protocol as @cloudflare/ai-chat, but its hook
// variant skips the client->server transcript sync Think doesn't support.
import { useAgentChat } from "@cloudflare/think/react";
import { useEffect, useRef } from "react";
import { ChatComposer } from "@/client/features/onboarding/OnboardingChatParts";
import { invalidateSamSessions } from "@/client/features/sam/samQueries";
import {
  ChatMessage,
  humanizeToolLabel,
  messageHasVisibleContent,
} from "@/client/components/chat/ChatMessage";

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
  const { messages, sendMessage, setMessages, clearHistory, status } =
    useAgentChat({ agent });

  const isBusy = status === "submitted" || status === "streaming";
  const sendText = (text: string) => void sendMessage({ text });

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
  const editAndResend = async (messageId: string, newText: string) => {
    if (await rewindTo(messageId)) void sendMessage({ text: newText });
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

  // Pin to the bottom while the user follows along.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

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
        <button
          type="button"
          className="btn btn-ghost btn-xs absolute right-3 top-2 z-10 text-base-content/40"
          onClick={() => clearHistory()}
        >
          Clear history (dev)
        </button>
      ) : null}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 ? (
            <div className="space-y-2 text-sm text-base-content/80">
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
            <div className="flex items-center gap-2 pt-1 text-base-content/40">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </span>
            </div>
          ) : null}

          {status === "error" ? (
            <p className="text-sm text-error">
              Something went wrong. Please try again.
            </p>
          ) : null}

          {showSuggestions ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/70 transition-colors hover:border-primary/50 hover:text-base-content"
                  onClick={() => sendText(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-base-300 px-5 py-3">
        <div className="mx-auto w-full max-w-2xl">
          <ChatComposer
            busy={isBusy}
            onSend={sendText}
            placeholder="Ask SAM to research, analyze, or track anything…"
          />
        </div>
      </div>
    </div>
  );
}
