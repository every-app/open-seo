import { CreditCard } from "lucide-react";
import type { ReactNode } from "react";

export function BillingHeader({ hasPaidPlan }: { hasPaidPlan: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-base-content/60">
        <CreditCard className="h-4 w-4" />
        Hosted billing
      </div>
      <h1 className="text-3xl font-semibold">
        {hasPaidPlan ? "Billing" : "Choose a plan"}
      </h1>
      <p className="max-w-2xl text-base-content/70">
        {hasPaidPlan
          ? "OpenSEO hosted usage is metered against your shared backlinks balance. Your monthly plan covers the first $5, and extra top-ups carry forward."
          : "You need a paid plan to use OpenSEO's managed service. The base plan costs $5/month and includes $5 of usage credits. If you use all of those credits, you can buy more at any time."}
      </p>
    </div>
  );
}

export function SubscriptionIntro({ hasPaidPlan }: { hasPaidPlan: boolean }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">
        {hasPaidPlan ? "Subscription" : "Managed service access"}
      </h2>
      <p className="text-sm text-base-content/65">
        {hasPaidPlan
          ? "Hosted workspaces need an active paid plan before project pages and DataForSEO-backed features are available."
          : "Start the base plan to unlock OpenSEO's managed service and your included monthly usage credits."}
      </p>
    </div>
  );
}

export function SubscriptionStatusCard({
  hasPaidPlan,
}: {
  hasPaidPlan: boolean;
}) {
  return (
    <div className="rounded-2xl border border-base-300 bg-base-200/50 p-4">
      <div className="text-sm text-base-content/60">
        {hasPaidPlan ? "Current status" : "Base plan"}
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {hasPaidPlan ? "Active" : "$5/month"}
      </div>
      <div className="mt-2 text-sm text-base-content/70">
        {hasPaidPlan
          ? "Your organization can use hosted OpenSEO features."
          : "Includes $5 of usage credits every month."}
      </div>
    </div>
  );
}

export function BillingAlerts(args: {
  actionError: string | null;
  hasPaidPlan: boolean;
}) {
  return (
    <>
      {args.actionError ? (
        <div className="alert alert-error">
          <span>{args.actionError}</span>
        </div>
      ) : null}

      {!args.hasPaidPlan ? (
        <div className="alert alert-warning">
          <span>
            Subscribe to the base plan first. After that, you can manage your
            plan and buy more credits here.
          </span>
        </div>
      ) : null}
    </>
  );
}

export function CenteredCard(args: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center p-6">
      <div className="card w-full max-w-xl border border-base-300 bg-base-100 shadow-xl">
        <div className="card-body gap-3">
          <h1 className="text-2xl font-semibold">{args.title}</h1>
          <p className="text-base-content/70">{args.body}</p>
          {args.action ? (
            <div className="card-actions justify-start pt-2">{args.action}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
