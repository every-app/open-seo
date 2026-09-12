import { useAgent } from "agents/react";
// Think speaks the same chat protocol as @cloudflare/ai-chat, but its hook
// variant skips the client->server transcript sync Think doesn't support.
import { useAgentChat } from "@cloudflare/think/react";
import { Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/client/features/onboarding/OnboardingChatParts";
import { invalidateSamSessions } from "@/client/features/sam/samQueries";
import { SamDebugTracePanel } from "@/client/features/sam/SamDebugTrace";
import { parseTraceFrame } from "@/client/features/sam/samTraceFormat";
import type { SamTraceFrame } from "@/shared/samToolTraceTypes";
import {
  ChatMessage,
  humanizeToolLabel,
  messageHasVisibleContent,
  type ResolveToolLabel,
  type ToolLabel,
} from "@/client/components/chat/ChatMessage";
import {
  isRecord,
  toolPartOutput,
  type ChatToolPart,
} from "@/client/components/chat/toolParts";
import { safeSamErrorMessage } from "@/client/features/sam/samErrorFallbacks";

// Audit lifecycle labels: collapse the poller into one human activity
// ("Running site audit…") with the outcome/progress as a detail suffix,
// instead of exposing raw tool names for every step of the wait.
function samToolLabel(partType: string): ToolLabel | null {
  const normalized = partType.startsWith("tool-") ? partType : `tool-${partType}`;
  if (normalized === "tool-run_site_audit") {
    return { running: "Starting site audit", done: "Site audit started" };
  }
  if (normalized === "tool-poll_site_audit") {
    const outcome = (part: ChatToolPart): string | null => {
      const output = toolPartOutput(part);
      if (!output || typeof output.state !== "string") return null;
      const progress = isRecord(output.progress) ? output.progress : undefined;
      const pages =
        progress &&
        typeof progress.current === "number" &&
        typeof progress.total === "number"
          ? `${progress.current}/${progress.total} pages`
          : null;
      switch (output.state) {
        case "completed":
          return pages ? `complete · ${pages}` : "complete";
        case "failed":
          return "failed";
        case "cancelled":
          return "cancelled";
        case "running":
          return pages ? `still running · ${pages}` : "still running";
        default:
          return null;
      }
    };
    return {
      running: "Running site audit",
      done: "Audit checked",
      detail: outcome,
    };
  }
  if (normalized === "tool-get_audit_issues") {
    return { running: "Checking issues", done: "Issues checked" };
  }
  if (normalized === "tool-get_audit_pages") {
    return { running: "Reading crawled pages", done: "Pages read" };
  }
  if (normalized === "tool-get_audit_status") {
    return { running: "Checking audit status", done: "Status checked" };
  }
  // SAM exposes the full MCP tool surface, too many to hand-label — fall back
  // to generic humanized names.
  return humanizeToolLabel(normalized);
}

const resolveSamToolLabel: ResolveToolLabel = (partType) =>
  samToolLabel(partType);

const SUGGESTIONS = [
  "What keywords should I focus on next?",
  "Who are my top SERP competitors?",
  "How is my Search Console traffic trending?",
  "Find quick-win keywords I already rank for",
];

// One-click workflow templates: longer prompts that start SAM on a full
// multi-tool research arc instead of a single question.
const WORKFLOW_PRESETS: { label: string; prompt: string }[] = [
  {
    label: "Full SEO opportunity analysis",
    prompt:
      "Run a full SEO opportunity analysis for this project: read the site, review Search Console performance, then research my strongest opportunities — keyword gaps, ranking quick wins, and content or technical issues worth fixing first. Summarize as a prioritized list.",
  },
  {
    label: "Commercial keyword research",
    prompt:
      "Research commercial keywords for this project: find high-intent terms people search when ready to buy, with realistic search volume and difficulty. Suggest where each should live on my site (or whether new pages are needed), and recommend which ones to save.",
  },
  {
    label: "Competitor analysis",
    prompt:
      "Identify my main SERP competitors and analyze them: what they rank for, where they win, and what content or keywords they cover that I don't. Give me a concrete gap list I can act on.",
  },
  {
    label: "Technical SEO",
    prompt:
      "Audit this site's technical SEO: run a site audit, then summarize the highest-impact issues (indexing, crawlability, Core Web Vitals, duplicate content) with a concrete fix order.",
  },
  {
    label: "Executive SEO plan",
    prompt:
      "Turn everything you know about this project into a short executive SEO plan: current standing, the 3–5 highest-leverage moves, expected impact, and a 90-day timeline. Keep it tight enough to share with a founder.",
  },
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
  // Multi-tool turns stream hundreds of WS chunks per assistant message (and a
  // single tool part can carry hundreds of KB). Each chunk replaces the whole
  // message in chat state, so an unthrottled store re-renders the chat tree
  // per chunk — faster than the main thread can commit, which React 19 aborts
  // as "Maximum update depth exceeded". 100ms coalesces chunk bursts to ≤10
  // renders/s; the final message still renders in full when the stream settles.
  const { messages, sendMessage, setMessages, clearHistory, status, error } =
    useAgentChat({ agent, experimental_throttle: 100 });

  const isBusy = status === "submitted" || status === "streaming";
  const sendText = (text: string) => void sendMessage({ text });

  // Debug Trace (Phase DT): conversation-scoped trace frame. Always ingests
  // `sam_trace` WebSocket frames whether the panel is currently open or not,
  // and hydrates via HTTP GET /trace and socket replay on mount/reconnect.
  // This guarantees opening the trace panel before, during, or after a turn
  // immediately hydrates the authoritative current/completed turn state.
  const [traceFrame, setTraceFrame] = useState<SamTraceFrame | null>(null);
  const [tracePanelOpen, setTracePanelOpen] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        const parsed = parseTraceFrame(event.data);
        if (parsed) {
          setTraceFrame(parsed);
        }
      }
    };
    agent.addEventListener("message", onMessage);
    return () => agent.removeEventListener("message", onMessage);
  }, [agent]);

  useEffect(() => {
    let active = true;
    fetch(`/agents/sam-chat/${sessionId}/trace`)
      .then(async (res) => {
        if (!res.ok) return null;
        const raw = await res.text();
        return parseTraceFrame(raw);
      })
      .then((data) => {
        if (active && data) {
          setTraceFrame((prev) => {
            if (!prev) return data;
            if (data.turnId && prev.turnId === data.turnId) return data;
            return prev;
          });
        }
      })
      .catch(() => {
        // Best-effort trace hydration
      });

    const requestSnapshot = () => {
      try {
        agent.send(JSON.stringify({ type: "sam_trace_request" }));
      } catch {
        // Socket may not be open yet
      }
    };
    agent.addEventListener("open", requestSnapshot);
    requestSnapshot();

    return () => {
      active = false;
      agent.removeEventListener("open", requestSnapshot);
    };
  }, [agent, sessionId]);

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
      <div className="absolute right-3 top-2 z-10 flex items-center gap-1">
        {(import.meta.env.DEV ||
          import.meta.env.VITE_SAM_DEBUG_TRACE === "1") &&
        !tracePanelOpen ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1 text-base-content/40"
            title="Show SAM Debug Trace"
            onClick={() => setTracePanelOpen(true)}
          >
            <Radio className="size-3" />
            Trace
          </button>
        ) : null}
        {import.meta.env.DEV ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs text-base-content/40"
            onClick={() => clearHistory()}
          >
            Clear history (dev)
          </button>
        ) : null}
      </div>
      {/* Debug Trace (developer-only, dev build or SAM_DEBUG_TRACE=1): floats
          above the conversation; collapse/clear are local-view-only. */}
      {(import.meta.env.DEV || import.meta.env.VITE_SAM_DEBUG_TRACE === "1") &&
      tracePanelOpen ? (
        <div className="pointer-events-none absolute right-3 top-8 z-20 flex justify-end">
          <SamDebugTracePanel
            frame={traceFrame}
            live={isBusy}
            onClose={() => setTracePanelOpen(false)}
            onClear={() => setTraceFrame(null)}
          />
        </div>
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

          {showSuggestions ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {WORKFLOW_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-base-content/80 transition-colors hover:border-primary/70 hover:bg-primary/10"
                    onClick={() => sendText(preset.prompt)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
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
            </div>
          ) : null}

          {messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              resolveToolLabel={resolveSamToolLabel}
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
              {/* The server normalizes provider failures into one curated,
                  secret-free message (auth / data policy / rate limit / …)
                  and delivers it as the terminal error body — at the turn
                  hook AND the stream boundary. safeSamErrorMessage is
                  defense-in-depth: if a raw provider payload ever reaches
                  this seam anyway, it degrades to the generic curated
                  message instead of rendering vendor text. */}
              {safeSamErrorMessage(error?.message)}
            </p>
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
