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
import { useStickToBottom } from "@/client/components/chat/useStickToBottom";

const SUGGESTIONS = [
  "接下来应该重点关注哪些关键词？",
  "我最主要的 SERP 竞争对手有哪些？",
  "我的 Search Console 流量趋势如何？",
  "查找已经获得排名且容易提升的关键词",
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
  const { scrollRef, onScroll, pinToBottom } = useStickToBottom(
    messages,
    status,
  );
  const sendText = (text: string) => {
    pinToBottom();
    void sendMessage({ text });
  };

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
    if (await rewindTo(messageId)) sendText(newText);
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
        <button
          type="button"
          className="btn btn-ghost btn-xs absolute right-3 top-2 z-10 text-base-content/40"
          onClick={() => clearHistory()}
        >
          清空历史（开发）
        </button>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-5 py-6"
      >
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 ? (
            <div className="space-y-2 text-sm text-base-content/80">
              <p>
                你好，我是 SAM，你的应用内 SEO
                智能体。我可以研究关键词、分析竞争对手，读取
                SERP、反向链接、排名追踪和 Search Console
                数据，并整理出项目下一步行动。
              </p>
              <p>你可以直接提问，也可以从以下建议开始：</p>
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
            <p className="text-sm text-error">出现问题，请重试。</p>
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
            placeholder="让 SAM 帮你研究、分析或追踪 SEO 数据…"
          />
        </div>
      </div>
    </div>
  );
}
