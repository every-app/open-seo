import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/pricing")({
  head: () =>
    buildPageSeo({
      title: "Pricing",
      description:
        "Plans from $10/mo, each with usage included every month. Pro and Agency include 20% more usage than you pay for. Estimate what your month would cost.",
      path: "/pricing",
      titleSuffix: "OpenSEO",
    }),
  component: Pricing,
});

/* ------------------------------------------------------------------ *
 * COST MODEL — edit everything pricing-related here.
 * Verified against the app call paths and live DataForSEO prices (Jul 2026).
 * Keep the math consistent with src/shared/billing.ts:
 *   billedUsd = roundTo5Decimals(rawDataForSeoCostUsd * MARKUP)
 *   creditsCharged = ceil(billedUsd * 1000)
 *   1 credit = $0.001  (1,000 credits = $1.00)
 * ------------------------------------------------------------------ */
const MARKUP = 1.28; // OpenSEO's flat 28% premium over raw DataForSEO cost
const CREDIT_USD = 0.001; // $ value of a single credit
const BASE_PRICE_USD = 10; // Base Plan / month
const BASE_INCLUDED_CREDIT_USD = 10; // $10 of usage credits included, reset monthly
const WEEKS_PER_MONTH = 4.345; // 52 / 12
const DEFAULT_RANK_DEPTH = 40;
const DEFAULT_LOCAL_SERP_DEPTH = 20;
const BACKLINK_HISTORY_DAYS = 365;
const RANK_CHECK_OPTIONS = [0, 1, 7] as const;
const RANK_CHECK_LABELS: Record<number, string> = {
  0: "Manual",
  1: "Weekly",
  7: "Daily",
};

// Raw DataForSEO per-call cost in USD (NOT including OpenSEO's markup).
const RAW_COST_USD = {
  // Scheduled checks use the queued API. The app defaults to one device and
  // the top 40 results: $0.0006 for page one + $0.00045 per extra page.
  rankCheck: 0.0006 + (DEFAULT_RANK_DEPTH / 10 - 1) * 0.00045,
  // Labs live costs $0.012/task + $0.00012/row (measured Sep 2026). Auto mode
  // blends two half-limit calls (suggestions + ideas), so the default
  // 150-result search is 2 x (0.012 + 75 x 0.00012) = $0.042; 300 results is
  // $0.060 and 500 is $0.084. Price the default, which is what nearly every
  // search uses.
  keywordLabs: 0.042,
  // The MCP-only local SERP tool defaults to a live Google Maps/Local Finder
  // request with 20 results: $0.002 for page one + $0.0015 for page two.
  localSerp: 0.002 + (DEFAULT_LOCAL_SERP_DEPTH / 10 - 1) * 0.0015,
  // A domain overview loads a summary plus one year of daily history. Current
  // Backlinks API pricing is $0.024/request + $0.000036/result for each call.
  backlinkProfile:
    0.024 + 0.000036 + (0.024 + BACKLINK_HISTORY_DAYS * 0.000036),
  aiPromptCheck: 0.0012, // One standard-queue answer per prompt and AI platform.
} as const;

// Ahrefs Lite list price, verified 2026-10-05 (ahrefs.com/pricing). Starter
// ($29) is cheaper but has 200 credits and no API, so Lite is the comparison.
const COMPETITORS = {
  ahrefsLite: 129,
} as const;

/** creditsCharged for a single action, per the billing formula. */
function creditsForRaw(rawUsd: number): number {
  const billedUsd = Math.round(rawUsd * MARKUP * 100_000) / 100_000;
  return Math.ceil(billedUsd * 1000);
}

// Credits charged per unit of each action (computed once from the model above).
const CREDITS_PER_UNIT = {
  keywordLabs: creditsForRaw(RAW_COST_USD.keywordLabs), // 54
  localSerp: creditsForRaw(RAW_COST_USD.localSerp), // 5
  backlinkProfile: creditsForRaw(RAW_COST_USD.backlinkProfile), // 79
  aiPromptCheck: creditsForRaw(RAW_COST_USD.aiPromptCheck), // 2
} as const;

/* ------------------------------------------------------------------ *
 * Plans — the cards at the top of the page. Pro and Agency include 20%
 * more usage than their price.
 * ------------------------------------------------------------------ */
/** The plan's ?plan= value on the app's subscribe page. */
type CheckoutPlan = "base" | "pro" | "agency";

type Plan = {
  name: string;
  id: CheckoutPlan;
  priceUsd: number;
  /** The yearly price, 2 months free. */
  annualPriceUsd: number;
  includedUsageUsd: number;
  audience: string;
  features: string[];
  /** Small print under the button. Every card keeps the line so they align. */
  signUpNote?: string;
  contactHref?: string;
  featured?: boolean;
};

const SIGN_UP_URL = "https://app.openseo.so/sign-up";

/**
 * Sign-up that goes straight to this plan on the app's subscribe page. Base
 * monthly is the free trial, so it stays a plain sign-up.
 */
function signUpHref(plan: CheckoutPlan, yearly: boolean) {
  if (plan === "base" && !yearly) return SIGN_UP_URL;
  const url = new URL(SIGN_UP_URL);
  url.searchParams.set(
    "redirect",
    `/subscribe?upgrade=true&plan=${plan}${yearly ? "&billing=yearly" : ""}`,
  );
  return url.href;
}

const PAY_AS_YOU_GO = "Pay as you go for extra usage";

const PLANS: Plan[] = [
  {
    name: "Base",
    id: "base",
    signUpNote: "Try for free",
    priceUsd: BASE_PRICE_USD,
    annualPriceUsd: 100,
    includedUsageUsd: BASE_INCLUDED_CREDIT_USD,
    audience: "For your own website.",
    features: [
      "Keyword research, backlinks, rank tracking, and site audits",
      "AI visibility, prompt research, and tracking",
      "Works inside Claude, Cursor, and ChatGPT",
      "Free Google Search Console data",
      PAY_AS_YOU_GO,
    ],
    featured: true,
  },
  {
    name: "Pro",
    id: "pro",
    priceUsd: 30,
    annualPriceUsd: 300,
    includedUsageUsd: 36,
    audience: "For freelancers and growing teams.",
    features: [
      "Everything in Base",
      "20% more usage than you pay for",
      "Priority email support",
      PAY_AS_YOU_GO,
    ],
  },
  {
    name: "Agency",
    id: "agency",
    priceUsd: 200,
    annualPriceUsd: 2000,
    includedUsageUsd: 240,
    audience: "For agencies with many clients.",
    features: [
      "Everything in Pro",
      "20% more usage than you pay for",
      "Dedicated Slack Connect channel",
      "AI enablement: hands-on help setting up agents and workflows for your team",
      PAY_AS_YOU_GO,
    ],
    contactHref: "https://calendar.app.google/F2ZQ9Rs3Jr4rfnpFA",
  },
];

/* ------------------------------------------------------------------ *
 * Personas — preset the estimator to the two modeled customers.
 * ------------------------------------------------------------------ */
type Inputs = {
  sites: number;
  keywordsPerSite: number;
  checksPerWeek: number;
  keywordRuns: number; // keyword-research runs / month
  localSerps: number; // MCP-only Google Maps / Local Finder SERPs per month
  backlinks: number; // backlink profile lookups / month
  aiPromptChecks: number; // One prompt on one AI platform, per month.
};

const PRESETS: Record<"business" | "freelancer", Inputs> = {
  // About $8/mo of usage: one site with weekly rank tracking and regular research.
  business: {
    sites: 1,
    keywordsPerSite: 50,
    checksPerWeek: 1,
    keywordRuns: 100,
    localSerps: 0,
    backlinks: 20,
    aiPromptChecks: 0,
  },
  // About $27/mo of usage: an agency checking 15 client sites weekly.
  freelancer: {
    sites: 15,
    keywordsPerSite: 20,
    checksPerWeek: 1,
    keywordRuns: 370,
    localSerps: 200,
    backlinks: 30,
    aiPromptChecks: 0,
  },
};

const usd = (n: number) =>
  n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

function Pricing() {
  const [persona, setPersona] = useState<"business" | "freelancer">("business");
  const [yearly, setYearly] = useState(false);
  const [inputs, setInputs] = useState<Inputs>(PRESETS.business);

  function applyPersona(next: "business" | "freelancer") {
    setPersona(next);
    setInputs(PRESETS[next]);
  }

  function set<K extends keyof Inputs>(key: K, value: number) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  const estimate = useMemo(() => {
    const scheduledRunsPerMonth =
      inputs.sites * inputs.checksPerWeek * WEEKS_PER_MONTH;
    const rankChecksPerMonth = Math.round(
      scheduledRunsPerMonth * inputs.keywordsPerSite,
    );

    const lines = [
      {
        key: "keywords",
        label: "Keyword research",
        detail: `${inputs.keywordRuns.toLocaleString()} searches this month`,
        credits: inputs.keywordRuns * CREDITS_PER_UNIT.keywordLabs,
      },
      {
        key: "backlinks",
        label: "Backlink checks",
        detail: `${inputs.backlinks.toLocaleString()} checks this month`,
        credits: inputs.backlinks * CREDITS_PER_UNIT.backlinkProfile,
      },
      {
        key: "ai",
        label: "AI prompt tracking",
        detail: `${inputs.aiPromptChecks.toLocaleString()} checks this month`,
        credits: inputs.aiPromptChecks * CREDITS_PER_UNIT.aiPromptCheck,
      },
      ...(persona === "freelancer"
        ? [
            {
              key: "local-serp",
              label: "Local SERP checks",
              detail: `${inputs.localSerps.toLocaleString()} checks this month`,
              credits: inputs.localSerps * CREDITS_PER_UNIT.localSerp,
            },
          ]
        : []),
      {
        key: "rank",
        label: "Rank tracking",
        detail: `${rankChecksPerMonth.toLocaleString()} checks this month`,
        // The app bills each site's scheduled run as one keyword batch.
        credits: Math.round(
          scheduledRunsPerMonth *
            creditsForRaw(inputs.keywordsPerSite * RAW_COST_USD.rankCheck),
        ),
      },
    ];

    const totalCredits = lines.reduce((sum, l) => sum + l.credits, 0);
    const usageUsd = totalCredits * CREDIT_USD;
    const includedInBase = usageUsd <= BASE_INCLUDED_CREDIT_USD;
    const topUpUsd = Math.max(0, usageUsd - BASE_INCLUDED_CREDIT_USD);
    const billUsd = Math.max(BASE_PRICE_USD, usageUsd);

    return { lines, usageUsd, includedInBase, topUpUsd, billUsd };
  }, [inputs, persona]);

  return (
    <article>
      {/* 1. Hero */}
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Pricing
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-5xl">
          Starts at $10/month
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[var(--color-brand-muted)]">
          Other SEO tools are too expensive. OpenSEO grows with you.
        </p>
      </div>

      {/* 2. Plans */}
      <div
        className="mx-auto mt-10 flex w-fit rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-1"
        role="group"
        aria-label="Billing period"
      >
        {(
          [
            [false, "Monthly"],
            [true, "Yearly (2 months free)"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setYearly(value)}
            aria-pressed={yearly === value}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              yearly === value
                ? "border border-[var(--color-border-subtle)] bg-white text-neutral-950 shadow-sm"
                : "border border-transparent text-neutral-600 hover:text-neutral-950"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        aria-label="Plans"
        className="mt-6 grid gap-5 md:grid-cols-3 md:items-stretch"
      >
        {PLANS.map((plan) => (
          <PlanCard key={plan.name} plan={plan} yearly={yearly} />
        ))}
      </section>

      {/* 3. How usage works */}
      <section className="mx-auto mt-16 max-w-4xl">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
          How usage-based pricing works
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--color-brand-muted)]">
          <p>
            Every plan includes a monthly amount of usage. Usage pays for new
            SEO data you look up: keyword research, backlinks, rank checks, site
            audits, and AI visibility checks. Each action costs what the data
            costs us plus a flat {Math.round((MARKUP - 1) * 100)}%, rounded up
            to the nearest tenth of a cent, so a keyword search is about $0.05
            and a rank check is a fraction of a cent.
          </p>
          <p>
            Your projects, saved results, exports, and Google Search Console
            data never use any. When you need more than your plan includes, buy
            extra usage or turn on auto-reload up to a monthly limit you set.
            Extra usage never expires.
          </p>
        </div>
      </section>

      {/* 4. The estimator */}
      <section className="mx-auto mt-10 max-w-4xl">
        <div className="grid divide-y divide-[var(--color-border-subtle)] rounded-xl border border-[var(--color-border-subtle)] bg-white lg:grid-cols-[1.1fr_1fr] lg:divide-x lg:divide-y-0">
          {/* Inputs */}
          <div className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
              Estimate your monthly usage
            </h2>

            {/* Persona toggle */}
            <div
              className="mt-4 inline-flex rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-1"
              role="group"
              aria-label="Choose a starting point"
            >
              {(
                [
                  ["business", "My own business"],
                  ["freelancer", "Freelancer / agency"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyPersona(value)}
                  aria-pressed={persona === value}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    persona === value
                      ? "border border-[var(--color-border-subtle)] bg-white text-neutral-950 shadow-sm"
                      : "border border-transparent text-neutral-600 hover:text-neutral-950"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <Slider
                label="Keyword searches / month"
                hint="About $0.05 per search at typical result limits."
                value={inputs.keywordRuns}
                min={0}
                max={1000}
                step={10}
                onChange={(v) => set("keywordRuns", v)}
              />
              <Slider
                label="Backlink checks / month"
                hint="About $0.08 for a domain overview with one year of history."
                value={inputs.backlinks}
                min={0}
                max={100}
                onChange={(v) => set("backlinks", v)}
              />
              <Slider
                label="AI prompt checks / month"
                hint="One prompt on one AI platform. About $0.002 per check."
                value={inputs.aiPromptChecks}
                min={0}
                max={persona === "business" ? 2000 : 10000}
                step={10}
                onChange={(v) => set("aiPromptChecks", v)}
              />
              {persona === "freelancer" ? (
                <>
                  <Slider
                    label="Local SERP checks / month"
                    hint="Google Maps or Local Finder via MCP, about $0.005 per check."
                    value={inputs.localSerps}
                    min={0}
                    max={1000}
                    step={10}
                    onChange={(v) => set("localSerps", v)}
                  />
                  <Slider
                    label="Websites"
                    value={inputs.sites}
                    min={1}
                    max={500}
                    onChange={(v) => set("sites", v)}
                  />
                </>
              ) : null}
              <Slider
                label="Keywords tracked per site"
                value={inputs.keywordsPerSite}
                min={0}
                max={200}
                step={5}
                onChange={(v) => set("keywordsPerSite", v)}
              />
              <Slider
                label="Rank tracking frequency"
                value={inputs.checksPerWeek}
                valueLabel={RANK_CHECK_LABELS[inputs.checksPerWeek]}
                options={RANK_CHECK_OPTIONS}
                onChange={(v) => set("checksPerWeek", v)}
              />
            </div>
          </div>

          {/* Results */}
          <div className="p-5 sm:p-6">
            <p className="text-sm text-[var(--color-brand-muted)]">
              Your estimated bill
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-neutral-950">
              {estimate.includedInBase
                ? `$${BASE_PRICE_USD}`
                : usd(estimate.billUsd)}
              <span className="text-lg font-normal text-[var(--color-brand-muted)]">
                /mo
              </span>
            </p>
            {estimate.includedInBase ? (
              <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle"
                />
                {usd(estimate.usageUsd)} of estimated usage fits inside the $
                {BASE_INCLUDED_CREDIT_USD} already included.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 tabular-nums text-[var(--color-brand-muted)]">
                ${BASE_PRICE_USD} plan + ~{usd(estimate.topUpUsd)} of extra
                usage. Extra usage never expires.
              </p>
            )}

            {/* Per-feature breakdown */}
            <div className="mt-5 border-t border-[var(--color-border-subtle)] pt-5">
              <p className="text-sm font-semibold text-neutral-950">
                Where it goes
              </p>
              <dl className="mt-3 space-y-2.5">
                {estimate.lines.map((line) => (
                  <div
                    key={line.key}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <dt className="text-sm text-neutral-700">
                      {line.label}
                      <span className="block text-xs text-neutral-500">
                        {line.detail}
                      </span>
                    </dt>
                    <dd className="shrink-0 text-sm font-medium tabular-nums text-neutral-950">
                      {usd(line.credits * CREDIT_USD)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-5 text-sm text-[var(--color-brand-muted)]">
              For comparison:{" "}
              <a
                href="/ahrefs-pricing"
                className="underline decoration-[var(--color-brand-accent)] underline-offset-4 hover:text-neutral-950"
              >
                Ahrefs Lite
              </a>{" "}
              is{" "}
              <span className="font-medium text-neutral-950">
                {usd(COMPETITORS.ahrefsLite)}/mo
              </span>
              .
            </p>
          </div>
        </div>
      </section>

      {/* 5. FAQ */}
      <section className="mx-auto mt-14 max-w-4xl">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
          FAQ
        </h2>
        <dl className="mt-5 divide-y divide-[var(--color-border-subtle)]">
          <div className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium text-neutral-950">
              Is there a free trial?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Yes. The free trial includes $0.50 of credits so you can test
              OpenSEO before subscribing.
            </dd>
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium text-neutral-950">
              What if I use all my credits for the month?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Buy top-up credits at any time, or turn on auto-reload so OpenSEO
              buys them for you when you run low, up to a monthly limit you set.
            </dd>
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium text-neutral-950">
              What features use credits?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Keyword research, backlinks, competitor data, site audits, rank
              tracking, and AI visibility research and tracking use credits.
              Your projects, settings, and any data already fetched don&apos;t
              cost credits.
            </dd>
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium text-neutral-950">
              Do unused credits roll over?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Top-up credits roll over indefinitely. The Usage Credits included
              with your plan reset each billing cycle.
            </dd>
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium text-neutral-950">
              Can I cancel anytime?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Yes. Cancel from your billing portal at any time. Your access
              continues through the end of the current billing period.
            </dd>
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium text-neutral-950">
              Do I need a subscription or just usage credits?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              While top-up Usage Credits roll over and don&apos;t expire, you
              need an active subscription in order to use OpenSEO.
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

function PlanCard({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  return (
    <div
      className={`flex flex-col rounded-xl border bg-white p-6 ${
        plan.featured
          ? "border-neutral-950 shadow-md"
          : "border-[var(--color-border-subtle)]"
      }`}
    >
      <h2 className="font-semibold text-neutral-950">{plan.name}</h2>
      <p className="mt-1 text-sm text-[var(--color-brand-muted)]">
        {plan.audience}
      </p>
      <p className="mt-5 text-4xl font-semibold tabular-nums tracking-tight text-neutral-950">
        ${(yearly ? plan.annualPriceUsd : plan.priceUsd).toLocaleString()}
        <span className="text-base font-normal text-[var(--color-brand-muted)]">
          {yearly ? "/yr" : "/mo"}
        </span>
      </p>
      <p className="mt-1 text-sm font-medium text-neutral-800">
        Includes ${plan.includedUsageUsd} of usage every month
      </p>
      <a
        href={signUpHref(plan.id, yearly)}
        className={`mt-6 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
          plan.featured
            ? "bg-neutral-950 text-white hover:bg-neutral-800"
            : "border border-[var(--color-border-subtle)] text-neutral-950 hover:border-neutral-950"
        }`}
      >
        Get started
        <span aria-hidden="true" className="ml-1.5">
          &rarr;
        </span>
      </a>
      <p className="mt-2 h-4 text-center text-xs text-neutral-500">
        {yearly ? null : plan.signUpNote}
      </p>
      <ul className="mt-4 space-y-2.5 border-t border-[var(--color-border-subtle)] pt-6">
        {plan.features.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm text-neutral-700">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-accent)]">
              <span className="sr-only">Included:</span>
            </span>
            {item}
          </li>
        ))}
      </ul>
      {plan.contactHref ? (
        <p className="mt-auto pt-6 text-sm text-[var(--color-brand-muted)]">
          Questions first?{" "}
          <a
            href={plan.contactHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            Book a call
          </a>
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Slider — native range input + live numeric readout.
 * ------------------------------------------------------------------ */
function Slider({
  label,
  hint,
  value,
  min,
  max,
  options,
  step = 1,
  valueLabel,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  options?: readonly number[];
  step?: number;
  valueLabel?: string;
  onChange: (value: number) => void;
}) {
  const optionIndex = options?.indexOf(value) ?? -1;
  const sliderValue = options ? Math.max(0, optionIndex) : value;
  const sliderMin = options ? 0 : (min ?? 0);
  const sliderMax = options ? options.length - 1 : (max ?? 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label className="text-sm font-medium text-neutral-800">{label}</label>
        <span className="text-sm font-semibold tabular-nums text-neutral-950">
          {valueLabel ?? value.toLocaleString()}
        </span>
      </div>
      {hint ? (
        <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">{hint}</p>
      ) : null}
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={options ? 1 : step}
        value={sliderValue}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChange(options?.[next] ?? next);
        }}
        aria-label={label}
        aria-valuetext={valueLabel}
        className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-border-subtle)] accent-[var(--color-brand-accent)]"
      />
    </div>
  );
}
