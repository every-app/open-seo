import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Check, Globe, Loader2, Sparkles } from "lucide-react";
import { FREE_ONBOARDING_QUESTION_LIMIT } from "@/shared/onboardingChat";

const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";

export function SuggestedQuestions({
  questions,
  primaryQuestion,
  onSelect,
}: {
  questions: string[];
  primaryQuestion?: string;
  onSelect: (question: string) => void;
}) {
  return (
    <div className="ml-10 flex flex-wrap gap-2">
      {questions.map((question) =>
        question === primaryQuestion ? (
          <button
            key={question}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            onClick={() => onSelect(question)}
          >
            <Sparkles className="size-3.5" />
            {question}
          </button>
        ) : (
          <button
            key={question}
            type="button"
            className="rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/70 transition-colors hover:border-primary/50 hover:text-base-content"
            onClick={() => onSelect(question)}
          >
            {question}
          </button>
        ),
      )}
    </div>
  );
}

export function WelcomeMessage({
  domain,
  checkoutError,
  isStartingCheckout,
  onUpgrade,
  onAskAboutOpenSeo,
  onProposeStrategy,
  disableActions,
}: {
  domain: string;
  checkoutError: string | null;
  isStartingCheckout: boolean;
  onUpgrade: () => void;
  onAskAboutOpenSeo: () => void;
  onProposeStrategy: () => void;
  disableActions: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3 pt-0.5 text-sm">
        <div className="space-y-3 text-base-content/80">
          <p>Hey, I’m Sam — welcome to OpenSEO.</p>
          <p>
            To get full access to OpenSEO, you need to upgrade to the paid plan.
            But, I’m here if you have any questions.
          </p>
          <p>
            You can also{" "}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="link link-primary"
            >
              join the Discord
            </a>{" "}
            or email{" "}
            <a href="mailto:ben@openseo.so" className="link link-primary">
              ben@openseo.so
            </a>{" "}
            if you have any questions I can’t help you with.
          </p>
          <p>
            Want me to analyze{" "}
            <span className="font-medium text-base-content">{domain}</span> and
            draft a strategy, or do you have questions first?
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-soft btn-sm"
            disabled={disableActions}
            onClick={onAskAboutOpenSeo}
          >
            Ask about OpenSEO
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disableActions}
            onClick={onProposeStrategy}
          >
            Show my strategy
          </button>
        </div>

        <div className="rounded-box border border-base-300 bg-base-200/50 p-3 text-xs lg:hidden">
          <p className="font-medium">Want Sam to keep going?</p>
          <p className="mt-0.5 text-base-content/70">
            Upgrade to run keyword research, rank tracking, and site audits on{" "}
            {domain}.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-xs mt-2"
            disabled={isStartingCheckout}
            onClick={onUpgrade}
          >
            {isStartingCheckout ? "Redirecting..." : "Upgrade"}
          </button>
          {checkoutError ? (
            <p className="mt-2 text-error">{checkoutError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Left-rail upgrade CTA. Hidden below `lg` (the inline callout + remaining
// hint cover narrow viewports).
export function UpgradeSidebar({
  domain,
  questionsUsed,
  isStartingCheckout,
  onUpgrade,
}: {
  domain: string;
  questionsUsed: number;
  isStartingCheckout: boolean;
  onUpgrade: () => void;
}) {
  const features = [
    "Keyword research, backlinks, rank tracking & site audits",
    "Google Search Console — read-only, no credits, no Google Cloud setup",
    "Connect Claude, Cursor, Codex & other MCP clients",
    "Top-up credits roll over and never expire",
  ];
  const used = Math.min(questionsUsed, FREE_ONBOARDING_QUESTION_LIMIT);
  const progress = (used / FREE_ONBOARDING_QUESTION_LIMIT) * 100;

  return (
    <aside className="hidden w-96 flex-shrink-0 flex-col border-r border-base-300 bg-base-200/20 lg:flex">
      <div className="flex items-center gap-2.5 border-b border-base-300 px-6 py-4 text-xs text-base-content/55">
        <span className="inline-flex size-8 items-center justify-center rounded-full border border-base-300 bg-base-100 text-primary">
          <Globe className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-base-content/80">Previewing OpenSEO</p>
          <p className="truncate" title={domain}>
            {domain}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-6 py-6">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight">$10</span>
            <span className="text-sm text-base-content/55">/month</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-base-content/55">
            Includes $10 of usage credits every month, plus a 30-day money-back
            guarantee.
          </p>
        </div>

        <ul className="space-y-3 border-t border-base-300 pt-5">
          {features.map((label) => (
            <li
              key={label}
              className="flex gap-2.5 text-sm leading-snug text-base-content/75"
            >
              <Check className="mt-0.5 size-4 flex-shrink-0 text-primary" />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-3 pt-2">
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={isStartingCheckout}
            onClick={onUpgrade}
          >
            {isStartingCheckout ? "Redirecting..." : "Upgrade to continue"}
          </button>
          <p className="text-center text-xs leading-relaxed text-base-content/55">
            Want advice from other OpenSEO users?{" "}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="link link-primary"
            >
              Join the Discord
            </a>
            .
          </p>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-base-300 px-6 py-4">
        <div className="h-1 w-full overflow-hidden rounded-full bg-base-300">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-base-content/55">
          {used} of {FREE_ONBOARDING_QUESTION_LIMIT} free questions used
        </p>
      </div>
    </aside>
  );
}

// Replaces the composer once a free user exhausts their question allowance.
export function ChatGate({
  isStartingCheckout,
  onUpgrade,
}: {
  isStartingCheckout: boolean;
  onUpgrade: () => void;
}) {
  return (
    <div className="flex-shrink-0 border-t border-base-300 px-5 py-4">
      <div className="mx-auto w-full max-w-2xl rounded-box border border-primary/30 bg-primary/5 p-4 text-center">
        <p className="text-sm font-medium">
          That’s all {FREE_ONBOARDING_QUESTION_LIMIT} free questions
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-base-content/70">
          Upgrade to keep working with Sam and unlock the full OpenSEO app.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm mt-3"
          disabled={isStartingCheckout}
          onClick={onUpgrade}
        >
          {isStartingCheckout ? "Redirecting..." : "Upgrade to continue"}
        </button>
        <p className="mt-2 text-xs text-base-content/45">
          30-day money-back guarantee
        </p>
      </div>
    </div>
  );
}

export function ChatComposer({
  busy,
  onSend,
}: {
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a few lines, then scroll. Resetting height to
  // `auto` first lets it shrink as well as grow.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-box border border-base-300 bg-base-100 px-3 py-2 focus-within:border-primary"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKey}
        rows={1}
        placeholder="Ask Sam about your strategy or OpenSEO…"
        className="max-h-40 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-base-content/50 focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Send message"
        disabled={busy || !value.trim()}
        className="btn btn-primary btn-circle btn-sm"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowUp className="size-4" />
        )}
      </button>
    </form>
  );
}
