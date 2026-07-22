import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/pricing")({
  head: () =>
    buildPageSeo({
      title: "Pricing estimator",
      description:
        "Start at $10/mo. The $10 includes $10 of usage, enough for most people. Move the sliders to estimate what your month would cost.",
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
  // A 150–300 result Labs search is currently $0.030–$0.048 raw. Use the
  // midpoint so the customer estimate is a memorable $0.05 per search.
  keywordLabs: 0.039,
  // The MCP-only local SERP tool defaults to a live Google Maps/Local Finder
  // request with 20 results: $0.002 for page one + $0.0015 for page two.
  localSerp: 0.002 + (DEFAULT_LOCAL_SERP_DEPTH / 10 - 1) * 0.0015,
  // A domain overview loads a summary plus one year of daily history. Current
  // Backlinks API pricing is $0.024/request + $0.000036/result for each call.
  backlinkProfile:
    0.024 + 0.000036 + (0.024 + BACKLINK_HISTORY_DAYS * 0.000036),
  aiCitationPerPlatform: 0.85, // AI-citation / brand scan, per platform (biggest driver)
} as const;

// Ahrefs Lite list price, verified 2026-07-01 (ahrefs.com/pricing).
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
  keywordLabs: creditsForRaw(RAW_COST_USD.keywordLabs), // 50
  localSerp: creditsForRaw(RAW_COST_USD.localSerp), // 5
  backlinkProfile: creditsForRaw(RAW_COST_USD.backlinkProfile), // 79
  aiCitation: creditsForRaw(RAW_COST_USD.aiCitationPerPlatform), // 1088
} as const;

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
  aiScans: number; // AI-citation scans / month (per platform)
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
    aiScans: 0,
  },
  // About $25/mo of usage: an agency checking 15 client sites weekly.
  freelancer: {
    sites: 15,
    keywordsPerSite: 20,
    checksPerWeek: 1,
    keywordRuns: 370,
    localSerps: 200,
    backlinks: 30,
    aiScans: 0,
  },
};

const usd = (n: number) =>
  n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

function Pricing() {
  const [persona, setPersona] = useState<"business" | "freelancer">("business");
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
        label: "ChatGPT brand checks",
        detail: `${inputs.aiScans.toLocaleString()} checks this month`,
        credits: inputs.aiScans * CREDITS_PER_UNIT.aiCitation,
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
    <article className="mx-auto max-w-4xl">
      {/* 1. Hero */}
      <p className="text-sm font-medium text-[var(--color-brand-accent)]">
        Pricing
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-5xl">
        Starts at $10/month
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--color-brand-muted)]">
        Other SEO tools are too expensive. OpenSEO grows with you.
      </p>

      {/* 2. Base Plan */}
      <section className="mt-10 border-y border-[var(--color-border-subtle)] py-8">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-semibold text-neutral-950">Base Plan</p>
            <p className="mt-1 text-sm text-[var(--color-brand-muted)]">
              One plan. Everything included.
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-neutral-950">
            $10
            <span className="text-base font-normal text-[var(--color-brand-muted)]">
              /mo
            </span>
          </p>
        </div>
        <ul className="mt-4 space-y-2">
          {[
            "Keyword research, backlinks, rank tracking, and site audits",
            "Works inside Claude, Cursor, and ChatGPT",
            "Google Search Console data is free and doesn't touch your $10",
            "Includes $10 of usage every month",
            "Buy extra usage anytime; it never expires",
          ].map((item) => (
            <li key={item} className="flex gap-2.5 text-sm text-neutral-700">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-accent)]">
                <span className="sr-only">Included:</span>
              </span>
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center gap-4">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex items-center justify-center rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Get Started
            <span aria-hidden="true" className="ml-1.5">
              &rarr;
            </span>
          </a>
          <p className="text-xs text-neutral-500">Try for free</p>
        </div>
      </section>

      {/* 3. The estimator */}
      <section className="mt-10">
        <div className="grid divide-y divide-[var(--color-border-subtle)] rounded-xl border border-[var(--color-border-subtle)] bg-white lg:grid-cols-[1.1fr_1fr] lg:divide-x lg:divide-y-0">
          {/* Inputs */}
          <div className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
              Estimate your month
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
                label="ChatGPT brand checks / month"
                hint="This is the expensive one, about $1.09 each."
                value={inputs.aiScans}
                min={0}
                max={50}
                onChange={(v) => set("aiScans", v)}
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
                    max={50}
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
              For comparison: Ahrefs&apos; cheapest plan is{" "}
              <span className="font-medium text-neutral-950">
                {usd(COMPETITORS.ahrefsLite)}/mo
              </span>
              .
            </p>
          </div>
        </div>
      </section>

      {/* 4. FAQ */}
      <section className="mt-14">
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
              You&apos;ll never have unexpected costs or bills. If you use all
              your credits, you&apos;ll see errors when you try to do tasks. You
              can purchase more top up credits at any time.
            </dd>
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium text-neutral-950">
              What features use credits?
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
              Credits are consumed by features that query DataForSEO&apos;s API
              — backlinks, keyword volume, competitor data, and site audits.
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
              with your Base Plan reset each billing cycle.
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
