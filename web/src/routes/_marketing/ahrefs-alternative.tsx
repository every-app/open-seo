import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import AhrefsAlternativeContent, {
  frontmatter,
} from "../../../content/marketing/ahrefs-alternative.mdx";
import {
  ComparisonTable,
  type ComparisonTableProps,
} from "@/components/comparison-table";
import { buildPageSeo, SITE_URL, toCanonicalUrl } from "@/lib/seo";

const PATH = "/ahrefs-alternative";
// Ahrefs prices and limits verified against ahrefs.com/pricing and
// help.ahrefs.com on this date. Re-check them whenever you bump it.
const UPDATED = "2026-10-05";

const comparison: ComparisonTableProps = {
  columns: [{ name: "OpenSEO", highlight: true }, { name: "Ahrefs" }],
  rows: [
    {
      label: "Starting price",
      cells: [
        { text: "$10/month, with $10 of usage included", tone: "positive" },
        { text: "Lite: $129/month. Starter: $29/month, without MCP" },
      ],
    },
    {
      label: "How usage is metered",
      cells: [
        {
          text: "Credits pay for new data. Reopening or exporting results uses none",
          tone: "positive",
        },
        {
          text: "Lite: 1,000 credits a month. Each report and filter uses one",
          tone: "negative",
        },
      ],
    },
    {
      label: "Extra users",
      cells: [
        {
          text: "No per-seat fee. Their research uses your credits",
          tone: "positive",
        },
        {
          text: "Lite: up to 2 more, up to $40/month each",
          tone: "negative",
        },
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
          text: "No trial. Refunds only on unused monthly plans",
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
          text: "Larger database: 28.7B keywords in 217 locations",
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
          text: "Larger index from Ahrefs' own crawler. Lite shows 6 months of history",
          tone: "positive",
        },
      ],
    },
    {
      label: "Rank tracking",
      cells: [
        {
          text: "Daily, weekly, or monthly, paid per check. 100 keywords weekly: about $1.09/month",
          tone: "positive",
        },
        { text: "750 keywords on Lite, updated weekly", tone: "positive" },
      ],
    },
    {
      label: "Site audits",
      cells: [
        {
          text: "Up to 10,000 pages per audit. Crawls without JavaScript rendering use no credits",
          tone: "positive",
        },
        { text: "Lite: 100,000 crawl credits a month", tone: "positive" },
      ],
    },
    {
      label: "AI agent access (MCP)",
      cells: [
        {
          text: "In the $10 plan and the free trial. Queries use credits",
          tone: "positive",
        },
        { text: "Lite and up. Calls use API units, 200,000 a month on Lite" },
      ],
    },
    {
      label: "AI search visibility",
      cells: [
        {
          text: "On-demand brand checks in ChatGPT and AI Overviews, about $1.09 each",
          tone: "positive",
        },
        {
          text: "Brand Radar: daily prompt tracking, 5 prompts on Lite. Full index from $199/month",
          tone: "positive",
        },
      ],
    },
    {
      label: "Content writing",
      cells: [
        { text: "No built-in writer", tone: "negative" },
        { text: "Content Kit add-on, from $99/month", tone: "positive" },
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
      name: "Ahrefs",
      url: "https://ahrefs.com/",
    },
  ],
};

export const Route = createFileRoute("/_marketing/ahrefs-alternative")({
  head: () =>
    buildPageSeo({
      title: "Ahrefs Alternative from $10/mo - AI-native, open source",
      description:
        "An open source Ahrefs alternative from $10 a month, free to try: keyword research, backlinks, competitor research, rank tracking, and site audits.",
      path: PATH,
      ogType: "article",
    }),
  component: AhrefsAlternativePage,
});

function AhrefsAlternativePage() {
  return (
    <article className="mx-auto max-w-4xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Ahrefs alternative
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
        <AhrefsAlternativeContent
          components={{
            ...defaultMdxComponents,
            ComparisonTable: () => <ComparisonTable {...comparison} />,
            SignUpButton,
          }}
        />
      </DocsBody>

      <section className="mt-14 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
        <p className="text-xl font-semibold tracking-tight text-neutral-950">
          See what $10 a month covers
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Start with free trial credits, then try the keyword, competitor, and
          backlink research you'd normally do in Ahrefs. If it covers what you
          need, you'll pay from $10 a month instead.
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
