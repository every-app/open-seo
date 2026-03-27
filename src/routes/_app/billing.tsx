import { createFileRoute, notFound } from "@tanstack/react-router";
import { AutumnProvider, useCustomer, useListPlans } from "autumn-js/react";
import { LoaderCircle } from "lucide-react";
import { CenteredCard } from "@/client/features/billing/BillingRouteParts";
import { HostedBillingContent } from "@/client/features/billing/HostedBillingContent";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute("/_app/billing")({
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  component: BillingPage,
});

function BillingPage() {
  return (
    <AutumnProvider>
      <BillingPageContent />
    </AutumnProvider>
  );
}

function BillingPageContent() {
  const { data: session, isPending: isSessionPending } = useSession();

  const customerQuery = useCustomer({
    queryOptions: {
      enabled: Boolean(session?.user?.id),
    },
  });

  const plansQuery = useListPlans({
    queryOptions: {
      enabled: Boolean(session?.user?.id),
    },
  });

  if (
    isSessionPending ||
    (session?.user?.id && (customerQuery.isLoading || plansQuery.isLoading))
  ) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-base-content/60" />
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <CenteredCard
        title="Sign in to manage billing"
        body="Your hosted billing settings are tied to your OpenSEO organization."
        action={
          <a className="btn btn-primary" href="/sign-in">
            Go to sign in
          </a>
        }
      />
    );
  }

  if (customerQuery.isError || plansQuery.isError) {
    return (
      <CenteredCard
        title="Billing unavailable"
        body="We could not load your billing details right now. Please reload and try again."
      />
    );
  }

  return (
    <HostedBillingContent
      customerQuery={customerQuery}
      plans={plansQuery.data ?? []}
    />
  );
}
