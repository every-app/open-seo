import { ShieldAlert } from "lucide-react";
import {
  AccessGate,
  AccessGateLoadingState,
} from "@/client/features/access-gate/AccessGate";

export function BacklinksAccessLoadingState() {
  return <AccessGateLoadingState />;
}

export function BacklinksSetupGate({
  errorMessage,
  isRefetching,
  onRetry,
}: {
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  return (
    <AccessGate
      title="Enable Backlinks"
      bodyText="Backlinks are not enabled for your DataForSEO account yet. You can enable them in DataForSEO, or use managed OpenSEO for long-term backlinks access at $10/month."
      helperText={
        <>
          We are also planning a Backlinks API so self-hosted apps can use
          OpenSEO's backlinks data directly. Until then,{" "}
          <InlineManagedOpenSeoLink />.
        </>
      }
      buttonLabel="Confirm DataForSEO Access"
      externalUrl="https://app.dataforseo.com/api-access-subscriptions"
      externalLabel="Open DataForSEO Backlinks"
      errorMessage={errorMessage}
      isRefetching={isRefetching}
      onRetry={onRetry}
    />
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

function InlineManagedOpenSeoLink() {
  return (
    <a
      className="underline underline-offset-2 hover:text-base-content/70"
      href="https://openseo.so/?utm_source=self_hosted_app&utm_medium=access_gate&utm_campaign=backlinks"
      target="_blank"
      rel="noreferrer"
    >
      use managed OpenSEO
    </a>
  );
}
