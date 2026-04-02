/* eslint-disable max-lines */
import type { UseCustomerResult } from "autumn-js/react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  BillingAlerts,
  BillingHeader,
  SubscriptionIntro,
  SubscriptionStatusCard,
} from "@/client/features/billing/BillingRouteParts";
import {
  AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID,
  AUTUMN_PAID_PLAN_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import {
  formatCreditAmount,
  formatPlanPrice,
  formatResetDate,
  getIncludedFeatureQuantity,
  parseTopUpAmount,
} from "@/client/features/billing/HostedBillingContentUtils";

type BillingAction = "start-plan" | "open-portal" | "top-up" | null;

type BillingCustomerQuery = Pick<
  UseCustomerResult,
  "data" | "attach" | "openCustomerPortal" | "refetch"
>;

type BillingPlan = {
  id: string;
  name: string;
  items: Array<{ featureId: string; included: number }>;
  price?: {
    amount?: number | null;
    interval?: string | null;
  } | null;
};

type HostedBillingContentProps = {
  customerQuery: BillingCustomerQuery;
  plans: BillingPlan[];
};

export function HostedBillingContent({
  customerQuery,
  plans,
}: HostedBillingContentProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<BillingAction>(null);
  const [topUpAmount, setTopUpAmount] = useState("20");

  const customer = customerQuery.data;
  const basePlan =
    plans.find((plan) => plan.id === AUTUMN_PAID_PLAN_ID) ?? null;
  const monthlyBalance =
    customer?.balances?.[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID] ?? null;
  const topupBalance =
    customer?.balances?.[AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID] ?? null;
  const hasManagedServiceAccess = Boolean(
    customer?.flags?.[AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID],
  );
  const isActionPending = pendingAction !== null;
  const basePlanName = basePlan?.name ?? "Base Plan";
  const basePlanPrice = formatPlanPrice(
    basePlan?.price?.amount,
    basePlan?.price?.interval,
  );
  const includedCreditsLabel = formatCreditAmount(
    getIncludedFeatureQuantity(basePlan, AUTUMN_SEO_DATA_BALANCE_FEATURE_ID),
  );
  const { isValid: isValidTopUpAmount, parsed: parsedTopUpAmount } =
    parseTopUpAmount(topUpAmount);
  const topUpDisabled =
    !hasManagedServiceAccess || isActionPending || !isValidTopUpAmount;

  const runBillingAction = async (
    action: BillingAction,
    callback: () => Promise<unknown>,
    fallbackMessage: string,
  ) => {
    setActionError(null);
    setPendingAction(action);

    try {
      await callback();
      if (action !== "open-portal") {
        await customerQuery.refetch();
      }
    } catch (error) {
      setActionError(getStandardErrorMessage(error, fallbackMessage));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <BillingHeader
        hasManagedServiceAccess={hasManagedServiceAccess}
        basePlanName={basePlanName}
        includedCreditsLabel={includedCreditsLabel}
      />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <SubscriptionSection
          basePlanName={basePlanName}
          basePlanPrice={basePlanPrice}
          hasManagedServiceAccess={hasManagedServiceAccess}
          includedCreditsLabel={includedCreditsLabel}
          isActionPending={isActionPending}
          isPortalPending={pendingAction === "open-portal"}
          isStartPlanPending={pendingAction === "start-plan"}
          onOpenPortal={() => {
            void runBillingAction(
              "open-portal",
              () =>
                customerQuery.openCustomerPortal({
                  returnUrl: window.location.href,
                }),
              "We could not open the billing portal. Please try again.",
            );
          }}
          onStartPlan={() => {
            void runBillingAction(
              "start-plan",
              () =>
                customerQuery.attach({
                  planId: AUTUMN_PAID_PLAN_ID,
                  redirectMode: "always",
                  successUrl: window.location.href,
                }),
              "We could not open the hosted billing flow. Please try again.",
            );
          }}
        />

        <SeoDataCreditsSection
          monthlyBalance={monthlyBalance}
          topupBalance={topupBalance}
          basePlanName={basePlanName}
          hasManagedServiceAccess={hasManagedServiceAccess}
          isTopUpPending={pendingAction === "top-up"}
          topUpAmount={topUpAmount}
          topUpDisabled={topUpDisabled}
          onTopUpAmountChange={setTopUpAmount}
          onTopUp={() => {
            void runBillingAction(
              "top-up",
              () =>
                customerQuery.attach({
                  planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
                  redirectMode: "always",
                  successUrl: window.location.href,
                  featureQuantities: [
                    {
                      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
                      quantity: Math.round(
                        parsedTopUpAmount * AUTUMN_SEO_DATA_CREDITS_PER_USD,
                      ),
                    },
                  ],
                }),
              "We could not open the credit purchase flow. Please try again.",
            );
          }}
        />
      </div>

      <BillingAlerts
        actionError={actionError}
        hasManagedServiceAccess={hasManagedServiceAccess}
        basePlanName={basePlanName}
      />

      <div className="flex items-center gap-2 text-sm text-base-content/60">
        <ExternalLink className="h-4 w-4" />
        <span>Hosted billing is powered by Autumn.</span>
      </div>
    </div>
  );
}

function SubscriptionSection(args: {
  basePlanName: string;
  basePlanPrice: string;
  hasManagedServiceAccess: boolean;
  includedCreditsLabel: string;
  isActionPending: boolean;
  isPortalPending: boolean;
  isStartPlanPending: boolean;
  onOpenPortal: () => void;
  onStartPlan: () => void;
}) {
  return (
    <section className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <SubscriptionIntro
          hasManagedServiceAccess={args.hasManagedServiceAccess}
          basePlanName={args.basePlanName}
        />

        <SubscriptionStatusCard
          hasManagedServiceAccess={args.hasManagedServiceAccess}
          basePlanName={args.basePlanName}
          basePlanPrice={args.basePlanPrice}
          includedCreditsLabel={args.includedCreditsLabel}
        />

        {args.hasManagedServiceAccess ? (
          <button
            type="button"
            className="btn btn-outline btn-block sm:btn-wide"
            disabled={args.isActionPending}
            onClick={args.onOpenPortal}
          >
            {args.isPortalPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            Open billing portal
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-block sm:btn-wide"
            disabled={args.isActionPending}
            onClick={args.onStartPlan}
          >
            {args.isStartPlanPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            Start {args.basePlanName}
          </button>
        )}
      </div>
    </section>
  );
}

type CreditBalance = {
  granted: number;
  remaining: number;
  usage: number;
  nextResetAt?: number | null;
} | null;

function SeoDataCreditsSection(args: {
  monthlyBalance: CreditBalance;
  topupBalance: CreditBalance;
  basePlanName: string;
  hasManagedServiceAccess: boolean;
  isTopUpPending: boolean;
  topUpAmount: string;
  topUpDisabled: boolean;
  onTopUp: () => void;
  onTopUpAmountChange: (value: string) => void;
}) {
  const totalRemaining =
    (args.monthlyBalance?.remaining ?? 0) + (args.topupBalance?.remaining ?? 0);

  return (
    <section className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div>
          <h2 className="text-lg font-semibold text-base-content">
            SEO data credits
          </h2>
          <p className="mt-1 text-sm text-base-content/70">
            Monthly credits are used first. Purchased top-ups never expire.
          </p>
        </div>

        <div className="rounded-box border border-base-300 bg-base-200/60 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-base-content/70">
              Total remaining
            </span>
            <span className="text-2xl font-semibold text-base-content">
              {formatCreditAmount(totalRemaining)}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <CreditPoolCard
            title="Monthly included"
            badge={formatResetDate(args.monthlyBalance?.nextResetAt ?? null)}
            remaining={args.monthlyBalance?.remaining ?? 0}
            granted={args.monthlyBalance?.granted ?? 0}
            usage={args.monthlyBalance?.usage ?? 0}
          />
          <CreditPoolCard
            title="Purchased top-ups"
            badge="Never expires"
            remaining={args.topupBalance?.remaining ?? 0}
            granted={args.topupBalance?.granted ?? 0}
            usage={args.topupBalance?.usage ?? 0}
          />
        </div>

        <label className="form-control gap-2">
          <span className="label-text font-medium">Top up amount</span>
          <div className="join">
            <span className="join-item inline-flex items-center rounded-l-btn border border-base-300 bg-base-200 px-4 text-base-content/70">
              $
            </span>
            <input
              type="number"
              min={10}
              max={99}
              step={1}
              inputMode="numeric"
              className="input join-item input-bordered w-full"
              value={args.topUpAmount}
              onChange={(event) => args.onTopUpAmountChange(event.target.value)}
            />
          </div>
          <span className="label-text-alt text-base-content/60">
            {args.hasManagedServiceAccess
              ? "Enter a whole-dollar amount between $10 and $99."
              : `Start ${args.basePlanName} before buying extra credits.`}
          </span>
        </label>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={args.topUpDisabled}
          onClick={args.onTopUp}
        >
          {args.isTopUpPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          Buy credits
        </button>

        <p className="text-xs leading-relaxed text-base-content/60">
          Credit purchases use our hosted checkout flow and apply to your
          organization's top-up balance.
        </p>
      </div>
    </section>
  );
}

function CreditPoolCard(args: {
  title: string;
  badge: string | null;
  remaining: number;
  granted: number;
  usage: number;
}) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-base-content">
          {args.title}
        </span>
        {args.badge ? (
          <span className="badge badge-sm badge-ghost text-base-content/60">
            {args.badge}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-xl font-semibold text-base-content">
        {formatCreditAmount(args.remaining)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-base-content/60">
        <div>
          <span className="block uppercase tracking-wide">Granted</span>
          <span className="font-medium text-base-content/80">
            {formatCreditAmount(args.granted)}
          </span>
        </div>
        <div>
          <span className="block uppercase tracking-wide">Used</span>
          <span className="font-medium text-base-content/80">
            {formatCreditAmount(args.usage)}
          </span>
        </div>
      </div>
    </div>
  );
}
