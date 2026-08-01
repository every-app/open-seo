import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useCustomer } from "autumn-js/react";
import { useEffect, useRef, useState } from "react";
import {
  ChatMessage,
  messageHasVisibleContent,
  type ResolveToolLabel,
} from "@/client/components/chat/ChatMessage";
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
  "tool-get_domain_overview": {
    running: "Analyzing domain",
    done: "Domain overview",
  },
  "tool-get_serp_results": {
    running: "Checking search results",
    done: "Search results",
  },
  "tool-find_serp_competitors": {
    running: "Finding competitors",
    done: "Competitors",
  },
  "tool-get_competitor_keywords": {
    running: "Analyzing competitor",
    done: "Competitor keywords",
  },
  "tool-get_backlinks_overview": {
    running: "Checking backlinks",
    done: "Backlinks overview",
  },
};

// Onboarding curates a label per tool and hides any tool it hasn't named, so
// the pre-paywall preview only shows the handful it means to surface.
const resolveToolLabel: ResolveToolLabel = (partType) =>
  TOOL_LABELS[partType] ?? null;

const SUGGESTED_QUESTIONS = [
  "How will OpenSEO help me get more traffic?",
  "Compare OpenSEO and Claude",
  "What do I get after I upgrade?",
  "How does the Google Search Console integration work?",
  "Right fit for consultants and agencies?",
];

// Highlighted (primary) chips shown first, before the general questions.
// STRATEGY_SUGGESTION drops out once the user has asked for their strategy.
const STRATEGY_SUGGESTION = "What do you recommend for my site?";
const COMPETITOR_SUGGESTION = "Compare against my competitors";
const PRIMARY_SUGGESTIONS = [STRATEGY_SUGGESTION, COMPETITOR_SUGGESTION];

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
  const suggestionPool = [
    ...(strategyRequested ? [] : [STRATEGY_SUGGESTION]),
    COMPETITOR_SUGGESTION,
    ...SUGGESTED_QUESTIONS,
  ];
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
  // Show the chips up front (before the first message) and after each assistant
  // reply, but not while a reply is mid-flight.
  const showSuggestions =
    remainingSuggestions.length > 0 &&
    !isBusy &&
    (messages.length === 0 || lastMessage?.role === "assistant");

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
            />

            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                resolveToolLabel={resolveToolLabel}
                streaming={
                  isBusy &&
                  index === messages.length - 1 &&
                  message.role === "assistant"
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
                {/* Billing gates (free-question cap / out-of-credits) come
                    back as normal assistant messages now, so this only covers
                    genuine failures. */}
                Something went wrong. Please refresh and try again.
              </p>
            ) : null}

            {showSuggestions ? (
              <SuggestedQuestions
                questions={remainingSuggestions}
                primaryQuestions={PRIMARY_SUGGESTIONS}
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
