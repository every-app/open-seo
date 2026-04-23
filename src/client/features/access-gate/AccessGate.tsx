import type { ReactNode } from "react";
import { ShieldAlert, Wrench } from "lucide-react";

export function AccessGateLoadingState() {
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

export function AccessGate({
  title,
  bodyText,
  helperText,
  buttonLabel,
  refetchingLabel = "Confirming...",
  externalUrl,
  externalLabel,
  errorMessage,
  isRefetching,
  onRetry,
}: {
  title: string;
  bodyText: ReactNode;
  helperText?: ReactNode;
  buttonLabel: string;
  refetchingLabel?: string;
  externalUrl: string;
  externalLabel: string;
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
            <h2 className="text-xl font-semibold">{title}</h2>
            <div className="text-sm text-base-content/68">{bodyText}</div>
            {helperText ? (
              <div className="text-xs text-base-content/50">{helperText}</div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={onRetry}
            disabled={isRefetching}
          >
            {isRefetching ? refetchingLabel : buttonLabel}
          </button>
          <a
            className="btn btn-outline"
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
          >
            {externalLabel}
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
