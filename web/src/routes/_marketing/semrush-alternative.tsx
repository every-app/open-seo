import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import SemrushAlternativeContent, {
  frontmatter,
} from "../../../content/marketing/semrush-alternative.mdx";
import {
  ComparisonTable,
  type ComparisonTableProps,
} from "@/components/comparison-table";
import { buildPageSeo, SITE_URL, toCanonicalUrl } from "@/lib/seo";

const PATH = "/semrush-alternative";
// Semrush prices and limits verified against semrush.com/pricing and the
// Semrush Knowledge Base on this date. Re-check them whenever you bump it.
const UPDATED = "2026-10-05";

const comparison: ComparisonTableProps = {
  columns: [{ name: "OpenSEO", highlight: true }, { name: "Semrush" }],
  rows: [
    {
      label: "Starting price",
      cells: [
        { text: "$10/month, with $10 of usage included", tone: "positive" },
        { text: "SEO plan: $139/month for one user" },
      ],
    },
    {
      label: "What the plan includes",
      cells: [
        { text: "Every feature and unlimited projects", tone: "positive" },
        { text: "5 websites and 500 tracked keywords on the SEO plan" },
      ],
    },
    {
      label: "Extra users",
      cells: [
        { text: "No per-seat fee", tone: "positive" },
        { text: "From $45/month per user", tone: "negative" },
      ],
    },
    {
      label: "Trial and refunds",
      cells: [
        {
          text: "Free trial credits, no card. 30-day money-back guarantee",
          tone: "positive",
        },
        {
          text: "7-day trial with a card. No refunds on monthly plans",
          tone: "negative",
        },
      ],
    },
    {
      label: "Keyword research",
      cells: [
        {
          text: "Volume, difficulty, CPC, intent, and trends in 143 countries",
          tone: "positive",
        },
        {
          text: "Larger database: 28.8B keywords in 142 countries",
          tone: "positive",
        },
      ],
    },
    {
      label: "Rank tracking",
      cells: [
        {
          text: "Daily, weekly, or monthly. 100 keywords weekly is about $1/month",
          tone: "positive",
        },
        {
          text: "500 keywords tracked daily on the SEO plan, 1,500 on Pro+",
          tone: "positive",
        },
      ],
    },
    {
      label: "Site audits",
      cells: [
        {
          text: "Up to 10,000 pages per audit, included",
          tone: "positive",
        },
        {
          text: "Included on every paid plan",
          tone: "positive",
        },
      ],
    },
    {
      label: "Backlinks",
      cells: [
        {
          text: "DataForSEO's index, with a year of history",
          tone: "positive",
        },
        {
          text: "Bigger index from Semrush's own crawler",
          tone: "positive",
        },
      ],
    },
    {
      label: "AI agent access (MCP)",
      cells: [
        {
          text: "Included, starting with the free trial",
          tone: "positive",
        },
        { text: "From $199/month, read-only" },
      ],
    },
    {
      label: "AI search visibility",
      cells: [
        {
          text: "Brand checks in ChatGPT and AI Overviews, about $1 each",
          tone: "positive",
        },
        {
          text: "Daily prompt tracking, from $99/month",
          tone: "positive",
        },
      ],
    },
    {
      label: "Ad research (PPC)",
      cells: [
        { text: "CPC data only", tone: "negative" },
        { text: "Advertising toolkit from $99/month", tone: "positive" },
      ],
    },
    {
      label: "Open source",
      cells: [
        { text: "Yes. MIT license, and you can self-host", tone: "positive" },
        { text: "No", tone: "negative" },
      ],
    },
  ],
};

const webPageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: frontmatter.title,
  description: frontmatter.description,
  url: toCanonicalUrl(PATH),
  dateModified: UPDATED,
  about: [
    { "@type": "SoftwareApplication", name: "OpenSEO", url: SITE_URL },
    {
      "@type": "SoftwareApplication",
      name: "Semrush",
      url: "https://www.semrush.com/",
    },
  ],
};

export const Route = createFileRoute("/_marketing/semrush-alternative")({
  head: () =>
    buildPageSeo({
      title: "Semrush Alternative from $10/mo - AI-native, open source",
      description:
        "An open source Semrush alternative from $10 a month: keyword research, rank tracking, site audits, and backlinks, built to work with your AI agent.",
      path: PATH,
      ogType: "article",
    }),
  component: SemrushAlternativePage,
});

function SemrushAlternativePage() {
  return (
    <article className="mx-auto max-w-4xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Semrush alternative
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {frontmatter.title}
        </h1>
        {frontmatter.description ? (
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
            {frontmatter.description}
          </p>
        ) : null}
        <SignUpButton />
        <p className="mt-3 text-xs text-neutral-500">No credit card needed.</p>
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a:not(.not-prose_a)]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_h4]:!text-neutral-950 [&_h4_a]:!no-underline [&_h5_a]:!no-underline [&_h6_a]:!no-underline [&_li]:!text-neutral-700 [&_li_a]:font-medium [&_li_a]:underline [&_li_a]:decoration-[var(--color-brand-accent)] [&_li_a]:underline-offset-4 [&_li_a:hover]:!text-neutral-700 [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        <SemrushAlternativeContent
          components={{
            ...defaultMdxComponents,
            ComparisonTable: () => <ComparisonTable {...comparison} />,
            SignUpButton,
          }}
        />
      </DocsBody>

      <section className="mt-14 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
        <p className="text-xl font-semibold tracking-tight text-neutral-950">
          Try OpenSEO before your next Semrush renewal
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Start with free trial credits, connect Search Console, and try the
          research you'd normally do in Semrush. If it covers what you need,
          you'll pay from $10 a month instead.
        </p>
        <SignUpButton />
      </section>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }}
      />
    </article>
  );
}

function SignUpButton() {
  return (
    <div className="not-prose mt-6">
      <a
        href="https://app.openseo.so/sign-up"
        className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
      >
        Start free trial
        <span className="ml-2" aria-hidden="true">
          &rarr;
        </span>
      </a>
    </div>
  );
}
