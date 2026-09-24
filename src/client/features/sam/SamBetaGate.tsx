import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { brand } from "@/shared/brand";

/**
 * Shown on the chat route until the user opts into Sam. Sam is the in-app
 * MCP plus skills wrapped in an in-app chat; the agents people already use
 * run that same toolset with a more mature harness, so the primary action
 * points there and Sam is the explicit fallback.
 */
export function SamBetaGate({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto px-4 py-8 md:px-6">
      <div className="w-full max-w-lg rounded-2xl border border-base-300 bg-base-100 p-6 md:p-8">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Sam is in beta</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-base-content/70">
          <p>
            Sam is the {brand.name} MCP and skills wrapped in a chat window. The
            agent you already use, like Claude Code, ChatGPT, Grok Bot, or
            Hermes, runs that same toolset on a much more capable harness. We
            recommend using {brand.name} there.
          </p>
          <p>You can still use Sam, but it is early and has rough edges.</p>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/ai" className="btn btn-primary">
            Set up your agent
          </Link>
          <button type="button" className="btn btn-ghost" onClick={onContinue}>
            Use Sam anyway
          </button>
        </div>
      </div>
    </div>
  );
}
