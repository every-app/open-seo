import { Link } from "@tanstack/react-router";
import { ShieldAlert, Wrench } from "lucide-react";

export function SamSetupGate({
  errorMessage,
  isRefetching,
  onRetry,
}: {
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  return (
    <section>
      <div className="rounded-2xl border border-base-300 bg-base-100 p-6 md:p-7 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-warning/15 p-2.5 text-warning shrink-0">
            <Wrench className="size-5" />
          </div>
          <div className="max-w-3xl space-y-1.5">
            <h2 className="text-xl font-semibold">Enable AI Features</h2>
            <div className="text-sm text-base-content/68">
              SAM, OpenSEO's in-app AI agent, needs an OpenRouter API key.
              Create a key on OpenRouter, set it as the{" "}
              <code>OPENROUTER_API_KEY</code> environment variable, restart
              OpenSEO, then confirm here.
            </div>
            <div className="text-xs text-base-content/50">
              Step-by-step instructions for every deployment are in the{" "}
              <Link
                className="underline underline-offset-2 hover:text-base-content/70"
                to="/help/openrouter-api-key"
              >
                OpenRouter API key setup guide
              </Link>
              .
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={onRetry}
            disabled={isRefetching}
          >
            {isRefetching ? "Confirming..." : "Confirm API Key"}
          </button>
          <a
            className="btn"
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Open OpenRouter Keys
          </a>
        </div>

        {errorMessage ? (
          <div className="alert alert-warning">
            <ShieldAlert className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
