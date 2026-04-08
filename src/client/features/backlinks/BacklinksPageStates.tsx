import { ShieldAlert, Wrench } from "lucide-react";
import type { BacklinksAccessStatusData } from "./backlinksPageTypes";
import { formatRelativeTimestamp } from "./backlinksPageUtils";

export function BacklinksAccessLoadingState() {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-10 w-48" />
      </div>
    </div>
  );
}

export function BacklinksSetupGate({
  status,
  isTesting,
  testError,
  onTest,
}: {
  status: BacklinksAccessStatusData | undefined;
  isTesting: boolean;
  testError: string | null;
  onTest: () => void;
}) {
  return (
    <section>
      <div className="rounded-2xl border border-base-300 bg-base-100 p-6 md:p-7 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-warning/15 p-2.5 text-warning shrink-0">
            <Wrench className="size-5" />
          </div>
          <div className="max-w-3xl space-y-1.5">
            <h2 className="text-xl font-semibold">Enable Backlinks</h2>
            <p className="text-sm text-base-content/68">
              Backlinks is not enabled for your DataForSEO account yet. Turn it
              on in DataForSEO, then test access here.
            </p>
            <p className="text-xs text-base-content/50">
              DataForSEO offers a free 14-day trial for Backlinks. Then, it's
              $100/month. We're gauging interest in building out a lower-cost
              alternative, <InlineMailingListLink /> if you're interested.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={onTest}
            disabled={isTesting}
          >
            {isTesting ? "Confirming..." : "Confirm Backlinks Access"}
          </button>
          <a
            className="btn btn-outline"
            href="https://app.dataforseo.com/api-access-subscriptions"
            target="_blank"
            rel="noreferrer"
          >
            Open DataForSEO Backlinks
          </a>
        </div>

        <BacklinksSetupFeedback status={status} testError={testError} />
      </div>
    </section>
  );
}

export function BacklinksLoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3 p-4">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-8 w-28" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-64 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="skeleton h-8 w-60" />
          <div className="skeleton h-80 w-full" />
        </div>
      </div>
    </div>
  );
}

export function BacklinksErrorState({
  errorMessage,
  onRetry,
}: {
  errorMessage: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-error/30 bg-error/5 p-6 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-error/10 p-2.5 text-error shrink-0">
          <ShieldAlert className="size-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Could not load backlinks</h2>
          <p className="text-sm text-base-content/70">
            {errorMessage ?? "Please try again in a moment."}
          </p>
        </div>
      </div>
      <button className="btn btn-outline btn-sm" onClick={onRetry}>
        Retry
      </button>
    </section>
  );
}

function BacklinksSetupFeedback({
  status,
  testError,
}: {
  status: BacklinksAccessStatusData | undefined;
  testError: string | null;
}) {
  return (
    <div className="space-y-3">
      {status?.lastCheckedAt ? (
        <div className="text-sm text-base-content/60">
          Last checked {formatRelativeTimestamp(status.lastCheckedAt)}.
        </div>
      ) : null}
      {status?.lastErrorMessage ? (
        <div className="alert alert-warning">
          <ShieldAlert className="size-4 shrink-0" />
          <span>{status.lastErrorMessage}</span>
        </div>
      ) : null}
      {testError ? (
        <div className="alert alert-error">
          <ShieldAlert className="size-4 shrink-0" />
          <span>{testError}</span>
        </div>
      ) : null}
    </div>
  );
}

function InlineMailingListLink() {
  return (
    <a
      className="underline underline-offset-2 hover:text-base-content/70"
      href="https://openseo.so"
      target="_blank"
      rel="noreferrer"
    >
      join the OpenSEO mailing list
    </a>
  );
}
