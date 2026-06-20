import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { type UIMessage } from "ai";
import { useCustomer } from "autumn-js/react";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import { Markdown } from "@/client/components/Markdown";
import { captureClientEvent } from "@/client/lib/posthog";
import { AUTUMN_PAID_PLAN_ID } from "@/shared/billing";
import { FREE_ONBOARDING_QUESTION_LIMIT } from "@/shared/onboardingChat";
import {
  ChatComposer,
  ChatGate,
  SuggestedQuestions,
  UpgradeSidebar,
  WelcomeMessage,
} from "./OnboardingChatParts";

// Whether an assistant message already shows something — visible text or a tool
// badge. Used to decide when the standalone typing indicator is still needed: a
// running tool badge already reads as progress, so the dots would double up.
function messageHasVisibleContent(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      (part.type === "text" && part.text.trim().length > 0) ||
      part.type.startsWith("tool-"),
  );
}

// Friendly labels for each tool Sam can run, so the chat shows what it's doing
// rather than going silent while it gathers site data. `running` shows while the
// call is in flight; `done` stays as a persistent badge once it finishes.
const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  "tool-read_website": { running: "Reading site", done: "Read site" },
  "tool-get_seo_metrics": {
    running: "Getting SEO metrics",
    done: "SEO metrics",
  },
  "tool-research_keywords": {
    running: "Researching keywords",
    done: "Keyword research",
  },
};

// A small inline badge for one tool call, rendered in document order inside the
// assistant bubble so the sequence of work stays visible after it completes.
function ToolBadge({ part }: { part: UIMessage["parts"][number] }) {
  const labels = TOOL_LABELS[part.type];
  if (!labels) return null;
  const state = "state" in part ? part.state : undefined;
  const isError = state === "output-error";
  const isDone = state === "output-available";
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

function ChatBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
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
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5 text-sm">
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return part.text.trim() ? (
              <Markdown key={index}>{part.text}</Markdown>
            ) : null;
          }
          if (part.type.startsWith("tool-")) {
            return <ToolBadge key={index} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

const SUGGESTED_QUESTIONS = [
  "How does OpenSEO help me get more traffic?",
  "Why is OpenSEO better than Claude?",
  "What do I get after I upgrade?",
  "How does Google Search Console work in OpenSEO?",
];

// Offered as a highlighted chip only when the user hasn't already asked for
// their strategy via the welcome CTA. Clicking it prompts Sam to draft/show it.
const STRATEGY_SUGGESTION = "What do you recommend for my site?";

export function OnboardingChatConversation({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  // The conversation lives in a Durable Object (Agents SDK), keyed by projectId,
  // so history persists across reloads. The WebSocket connection is authorized
  // in the Worker (src/server.ts) before it reaches the DO; billing gates come
  // back as normal assistant messages rather than HTTP errors.
  const agent = useAgent({ agent: "onboarding-chat", name: projectId });
  const { messages, sendMessage, status } = useAgentChat({ agent });

  // This chat is only ever the pre-upgrade free preview: once a user upgrades
  // they are routed into the GSC onboarding step and never return here, so
  // there's no "paid" state to model — the question cap always applies.
  const customerQuery = useCustomer();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [usedSuggestions, setUsedSuggestions] = useState<string[]>([]);
  // Set once the user asks for their strategy (welcome CTA or the strategy
  // chip) so we don't keep offering the "What do you recommend" chip.
  const [strategyRequested, setStrategyRequested] = useState(false);

  const questionsUsed = messages.filter((m) => m.role === "user").length;
  const remaining = Math.max(0, FREE_ONBOARDING_QUESTION_LIMIT - questionsUsed);
  const isLocked = remaining <= 0;
  // Nudge once they're within the last few questions, not from the start.
  const showRemainingHint = remaining > 0 && remaining <= 3;

  const isBusy = status === "submitted" || status === "streaming";
  const sendText = (text: string) => void sendMessage({ text });
  async function startCheckout() {
    setCheckoutError(null);
    setIsStartingCheckout(true);
    try {
      captureClientEvent("billing:checkout_start");
      // After payment, re-enter onboarding at the GSC step (not back into this
      // chat) so the user finishes connecting Search Console + MCP.
      const successUrl = new URL("/onboarding", window.location.origin);
      successUrl.searchParams.set("step", "3");
      successUrl.searchParams.set("checkout", "success");
      await customerQuery.attach({
        planId: AUTUMN_PAID_PLAN_ID,
        redirectMode: "always",
        successUrl: successUrl.toString(),
      });
    } catch (checkoutErr) {
      console.error("Failed to start checkout", checkoutErr);
      setCheckoutError(
        "We couldn't start checkout. Please refresh and try again.",
      );
      setIsStartingCheckout(false);
    }
  }

  // Pin to the bottom while the user is following along; the strategy doc plus
  // a streaming reply quickly grows past the viewport.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const lastMessage = messages[messages.length - 1];
  const suggestionPool = strategyRequested
    ? SUGGESTED_QUESTIONS
    : [STRATEGY_SUGGESTION, ...SUGGESTED_QUESTIONS];
  const remainingSuggestions = suggestionPool.filter(
    (question) => !usedSuggestions.includes(question),
  );
  // Show the typing indicator from the moment the user sends until the
  // assistant's reply shows something — covers the "submitted" wait (last
  // message is still the user's own) and the gap before any text or tool badge
  // renders. Once a tool badge is in flight, it carries the progress, so the
  // dots would just double up.
  const showTyping =
    isBusy &&
    (lastMessage?.role !== "assistant" ||
      !messageHasVisibleContent(lastMessage));
  const showSuggestions =
    remainingSuggestions.length > 0 &&
    !isBusy &&
    messages.length > 0 &&
    lastMessage?.role === "assistant";

  return (
    <div className="flex min-h-0 flex-1">
      <UpgradeSidebar
        domain={domain}
        questionsUsed={questionsUsed}
        isStartingCheckout={isStartingCheckout}
        onUpgrade={() => void startCheckout()}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <WelcomeMessage
              domain={domain}
              checkoutError={checkoutError}
              isStartingCheckout={isStartingCheckout}
              onUpgrade={() => void startCheckout()}
              onAskAboutOpenSeo={() =>
                sendText("I have questions about OpenSEO before I upgrade.")
              }
              onProposeStrategy={() => {
                setStrategyRequested(true);
                sendText(
                  `Please analyze ${domain} and show me my SEO strategy.`,
                );
              }}
              disableActions={isBusy || messages.length > 0}
            />

            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {showTyping ? (
              <div className="flex gap-3">
                <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="flex items-center gap-2 pt-2 text-base-content/40">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-current" />
                  </span>
                </div>
              </div>
            ) : null}

            {status === "error" ? (
              <div className="flex gap-3">
                <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
                  <Sparkles className="size-4" />
                </div>
                <p className="pt-1 text-sm text-error">
                  {/* Billing gates (free-question cap / out-of-credits) come
                      back as normal assistant messages now, so this only covers
                      genuine failures. */}
                  Something went wrong. Please refresh and try again.
                </p>
              </div>
            ) : null}

            {showSuggestions ? (
              <SuggestedQuestions
                questions={remainingSuggestions}
                primaryQuestion={STRATEGY_SUGGESTION}
                onSelect={(question) => {
                  setUsedSuggestions((current) =>
                    current.includes(question)
                      ? current
                      : [...current, question],
                  );
                  if (question === STRATEGY_SUGGESTION) {
                    setStrategyRequested(true);
                  }
                  sendText(question);
                }}
              />
            ) : null}
          </div>
        </div>

        {isLocked ? (
          <ChatGate
            isStartingCheckout={isStartingCheckout}
            onUpgrade={() => void startCheckout()}
          />
        ) : (
          <div className="flex-shrink-0 border-t border-base-300 px-5 py-3">
            <div className="mx-auto w-full max-w-2xl space-y-2">
              {showRemainingHint ? (
                <p className="px-1 text-xs text-base-content/50">
                  {remaining} free question{remaining === 1 ? "" : "s"} left.{" "}
                  <button
                    type="button"
                    className="link link-primary"
                    disabled={isStartingCheckout}
                    onClick={() => void startCheckout()}
                  >
                    Upgrade for full access
                  </button>
                </p>
              ) : null}
              <ChatComposer busy={isBusy} onSend={sendText} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
