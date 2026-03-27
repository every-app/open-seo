import { CreditCard } from "lucide-react";
import type { ReactNode } from "react";

export function BillingHeader(args: {
  hasManagedServiceAccess: boolean;
  basePlanName: string;
  includedCreditsLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-base-content/60">
        <CreditCard className="h-4 w-4" />
        Hosted billing
      </div>
      <h1 className="text-3xl font-semibold">
        {args.hasManagedServiceAccess ? "Billing" : "Choose a plan"}
      </h1>
      <p className="max-w-2xl text-base-content/70">
        {args.hasManagedServiceAccess
          ? `OpenSEO hosted usage is metered against your shared backlinks balance. ${args.basePlanName} includes ${args.includedCreditsLabel} of usage credits each cycle, and extra top-ups carry forward.`
          : `You need an active ${args.basePlanName} subscription to use OpenSEO's managed service. It includes ${args.includedCreditsLabel} of usage credits each cycle, and you can buy more at any time.`}
      </p>
    </div>
  );
}

export function SubscriptionIntro(args: {
  hasManagedServiceAccess: boolean;
  basePlanName: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold">
        {args.hasManagedServiceAccess
          ? "Subscription"
          : "Managed service access"}
      </h2>
      <p className="text-sm text-base-content/65">
        {args.hasManagedServiceAccess
          ? "Hosted workspaces need an active paid plan before project pages and DataForSEO-backed features are available."
          : `Start ${args.basePlanName} to unlock OpenSEO's managed service and your included monthly usage credits.`}
      </p>
    </div>
  );
}

export function SubscriptionStatusCard(args: {
  hasManagedServiceAccess: boolean;
  basePlanName: string;
  basePlanPrice: string;
  includedCreditsLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-base-300 bg-base-200/50 p-4">
      <div className="text-sm text-base-content/60">
        {args.hasManagedServiceAccess ? "Current status" : args.basePlanName}
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {args.hasManagedServiceAccess ? "Active" : args.basePlanPrice}
      </div>
      <div className="mt-2 text-sm text-base-content/70">
        {args.hasManagedServiceAccess
          ? "Your organization can use hosted OpenSEO features."
          : `Includes ${args.includedCreditsLabel} of usage credits every cycle.`}
      </div>
    </div>
  );
}

export function BillingAlerts(args: {
  actionError: string | null;
  hasManagedServiceAccess: boolean;
  basePlanName: string;
}) {
  return (
    <>
      {args.actionError ? (
        <div className="alert alert-error">
          <span>{args.actionError}</span>
        </div>
      ) : null}

      {!args.hasManagedServiceAccess ? (
        <div className="alert alert-warning">
          <span>
            Subscribe to {args.basePlanName} first. After that, you can manage
            your plan and buy more credits here.
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
