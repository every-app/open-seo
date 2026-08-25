import { createFileRoute } from "@tanstack/react-router";
import { BacklinkCheckerTool } from "@/components/backlink-checker-tool";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/backlink-checker")({
  head: () =>
    buildPageSeo({
      title: "Free Backlink Checker: Check Backlinks to Any Website",
      description:
        "Check backlinks for any domain: referring domains, top backlinks, anchor text, and follow status. Instant results, no signup required.",
      path: "/backlink-checker",
      titleSuffix: "OpenSEO",
      imageAlt: "OpenSEO free backlink checker",
    }),
  component: BacklinkCheckerPage,
});

const FAQS = [
  {
    question: "Where does the backlink data come from?",
    answer:
      "Results come from DataForSEO's link index, the same data source that powers backlink research inside OpenSEO. The index is refreshed continuously, so counts can differ slightly from other tools that crawl the web on their own schedule.",
  },
  {
    question: "How many backlinks can I see for free?",
    answer:
      "The free checker shows a domain's summary metrics and its top 15 backlinks, one per referring domain, ranked by domain strength. Sign up for OpenSEO to page through the full list, see referring domains and anchors, filter out spam, and export the data.",
  },
  {
    question: "Can I check a competitor's backlinks?",
    answer:
      "Yes. Enter any domain — yours, a competitor's, or a site you're evaluating for outreach. Backlink data is public-web data, so no site ownership or verification is needed.",
  },
  {
    question: "What is domain rank?",
    answer:
      "Domain rank is a 0-100 score of a domain's link-profile strength, similar to domain authority metrics in other tools. Higher means the domain has more and stronger links pointing at it.",
  },
];

function BacklinkCheckerPage() {
  return (
    <article className="mx-auto max-w-5xl">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Free tool
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          Free Backlink Checker
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Check the backlinks of any website. Enter a domain and get its domain
          rank, referring domains, and top backlinks with anchor text and follow
          status.
        </p>
      </header>

      <div className="mt-8">
        <BacklinkCheckerTool />
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What you get
        </h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Link profile summary",
              description:
                "Domain rank, total backlinks, referring domains, and broken backlinks for the domain you check.",
            },
            {
              title: "Top backlinks",
              description:
                "The strongest links pointing at the domain, one per referring domain, with anchor text and follow status.",
            },
            {
              title: "Competitor visibility",
              description:
                "Works on any domain, so you can see who links to competitors and where their authority comes from.",
            },
          ].map((item, index) => (
            <li
              key={item.title}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5"
            >
              <span className="font-mono text-sm tabular-nums text-[var(--color-brand-accent)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-base font-semibold text-neutral-950">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          FAQ
        </h2>
        <div className="mt-5 divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-white">
          {FAQS.map((faq) => (
            <div key={faq.question} className="p-5">
              <h3 className="text-sm font-semibold text-neutral-900">
                {faq.question}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Go deeper than a spot check
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          OpenSEO puts full backlink analysis next to keyword research, rank
          tracking, and site audits — open source, starting free.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try OpenSEO
            <span aria-hidden="true" className="ml-2">
              &rarr;
            </span>
          </a>
          <a
            href="/features/backlink-checker"
            className="text-sm font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            Learn about the Backlinks feature
            <span aria-hidden="true" className="ml-1">
              &rarr;
            </span>
          </a>
        </div>
      </section>
    </article>
  );
}
