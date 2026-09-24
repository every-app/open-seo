import { createFileRoute } from "@tanstack/react-router";
import { appLinks, brand } from "@/lib/brand";
import { buildPageSeo } from "@/lib/seo";

// TODO pricing: this page describes the plan structure only. Fill in the real
// prices, included credits and top-up rates for this deployment before launch,
// and keep them consistent with the app's billing configuration.

export const Route = createFileRoute("/_marketing/pricing")({
  head: () =>
    buildPageSeo({
      title: "Pricing",
      description: `Start ${brand.name} for free, then upgrade to Pro for usage credits that cover keyword research, backlinks, rank tracking and site audits. Google Search Console data never uses credits.`,
      path: "/pricing",
      titleSuffix: brand.name,
    }),
  component: Pricing,
});

type Plan = {
  name: string;
  price: string;
  cadence?: string;
  summary: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    summary: "Try the workspace and connect your AI agent.",
    features: [
      "Trial credits to test keyword, backlink and domain research",
      "Site audits for smaller sites",
      "Google Search Console reads at no cost",
      "MCP access for Claude, Codex, Cursor and other agents",
    ],
    cta: { label: "Start for free", href: appLinks.signUp },
  },
  {
    name: "Pro",
    price: "Usage credits",
    cadence: "billed monthly",
    summary: "A monthly plan with usage credits included, plus top-ups.",
    features: [
      "Keyword research, backlinks, rank tracking and site audits",
      "Scheduled rank tracking and larger crawls",
      "Monthly credits included; buy more anytime",
      "Top-up credits never expire",
    ],
    cta: { label: "Get started", href: appLinks.signUp },
    highlight: true,
  },
];

const FAQS = [
  {
    question: "Is there a free plan?",
    answer: `Yes. Sign up, connect your agent, and try ${brand.name} with trial credits before you subscribe.`,
  },
  {
    question: "What uses credits?",
    answer:
      "Features that query the data provider: keyword volume and difficulty, SERP results, backlinks, domain overviews, rank checks and AI visibility scans. Your projects, settings, saved reports and Google Search Console reads do not use credits.",
  },
  {
    question: "What happens when I run out of credits?",
    answer:
      "Nothing is charged automatically. Data-backed features return an error until your included credits reset or you buy a top-up.",
  },
  {
    question: "Do unused credits roll over?",
    answer:
      "Top-up credits roll over indefinitely. Credits included with the Pro plan reset each billing cycle.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel from your billing portal at any time. Your access continues through the end of the current billing period.",
  },
];

function Pricing() {
  return (
    <article className="mx-auto max-w-4xl">
      <p className="text-sm font-medium text-[var(--color-brand-accent)]">
        Pricing
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-5xl">
        Start free. Pay for the data you use.
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--color-brand-muted)]">
        {brand.name} bills research as usage credits instead of a triple-digit
        seat, so a small site and an agency both pay for what they actually
        run.
      </p>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col rounded-xl border bg-white p-6 ${
              plan.highlight
                ? "border-neutral-950"
                : "border-[var(--color-border-subtle)]"
            }`}
          >
            <p className="font-semibold text-neutral-950">{plan.name}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
              {plan.price}
              {plan.cadence ? (
                <span className="ml-1.5 text-sm font-normal text-[var(--color-brand-muted)]">
                  {plan.cadence}
                </span>
              ) : null}
            </p>
            <p className="mt-2 text-sm text-[var(--color-brand-muted)]">
              {plan.summary}
            </p>
            <ul className="mt-4 space-y-2">
              {plan.features.map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-sm text-neutral-700"
                >
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-accent)]">
                    <span className="sr-only">Included:</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={plan.cta.href}
              className={`mt-6 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
                plan.highlight
                  ? "bg-neutral-950 text-white hover:bg-neutral-800"
                  : "border border-[var(--color-border-subtle)] text-neutral-950 hover:border-neutral-950"
              }`}
            >
              {plan.cta.label}
              <span aria-hidden="true" className="ml-1.5">
                &rarr;
              </span>
            </a>
          </div>
        ))}
      </section>

      <p className="mt-4 text-xs text-neutral-500">
        Current prices and included credits are shown in the app when you
        subscribe. Self-hosted deployments pay their data provider directly.
      </p>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
          FAQ
        </h2>
        <dl className="mt-5 divide-y divide-[var(--color-border-subtle)]">
          {FAQS.map((faq) => (
            <div key={faq.question} className="py-4 first:pt-0 last:pb-0">
              <dt className="text-sm font-medium text-neutral-950">
                {faq.question}
              </dt>
              <dd className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
