import { createFileRoute } from "@tanstack/react-router";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";
import { competitiveAnalysisStrategies } from "@/lib/strategy-libraries";

const PATH = "/library/competitive-analysis";

const faqs = [
  {
    question: "What is competitor analysis in SEO?",
    answer:
      "Working out which domains hold the search results you want, what they rank for that you do not, and whether their advantage comes from content, links, brand, or a small number of strong pages. It differs from business competitor analysis because search ranks pages, not companies, so the domains taking your clicks are often not the companies taking your deals.",
  },
  {
    question: "How do you find your competitors' websites?",
    answer:
      "Compare a set of keywords you want to rank for and look at which domains appear across those results. A measured list built from real SERPs is more reliable than a list assembled from memory, and it will usually include directories, marketplaces, and video platforms alongside the companies you expected.",
  },
  {
    question: "What are the types of competitor analysis?",
    answer:
      "For search work, three groupings matter more than any formal framework. Direct competitors sell what you sell and rank for what you want. Structural results such as directories and marketplaces hold positions by category rather than by merit. Accidental competitors rank on a single strong page. Each calls for a different response, and treating all three the same is the most common way a competitive analysis goes wrong.",
  },
  {
    question: "Is there a free competitor analysis tool?",
    answer:
      "The reasoning half is free: read the SERPs you care about, read your competitors' pages, and check your own Search Console. The part that costs money is the ranked-keyword and backlink data on the competitor's side, which is why the big SEO suites run $100/month and up. OpenSEO is open source and free to start; the paid plan is $10/month and includes $10 of usage, with top-ups if you need more.",
  },
  {
    question: "How accurate are competitor traffic estimates?",
    answer:
      "Directionally useful and numerically unreliable. Estimates are modelled from ranked keywords, estimated search volumes, and assumed click-through rates, so they inherit every error in all three, and they aggregate every business line a domain operates. Treat an estimate as an order of magnitude and a trend, not a number to plan revenue against.",
  },
  {
    question: "What is a keyword gap analysis?",
    answer:
      "The set of keywords a competitor ranks for and you do not. It is only useful once brand terms are removed from both sides, because otherwise the largest part of the difference is simply that the two companies have different names.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

const breadcrumbLd = buildBreadcrumbJsonLd([
  { name: "Strategy Library", path: "/library" },
  { name: "Competitive Analysis", path: PATH },
]);

export const Route = createFileRoute(
  "/_marketing/library/competitive-analysis/",
)({
  head: () =>
    buildPageSeo({
      title: "SEO Competitor Analysis: The Strategy Library",
      description:
        "Four competitive research strategies for finding who really ranks against you, measuring the gap honestly, and deciding what is worth taking. Each includes a workflow and an OpenSEO MCP prompt.",
      path: PATH,
      titleSuffix: "OpenSEO",
    }),
  component: CompetitiveAnalysisLibraryPage,
});

function CompetitiveAnalysisLibraryPage() {
  return (
    <article className="mx-auto max-w-5xl">
      <header className="max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="text-sm text-[var(--color-brand-muted)]"
        >
          <a
            href="/library"
            className="font-medium text-[var(--color-brand-accent)]"
          >
            Strategy Library
          </a>{" "}
          / <span>Competitive Analysis</span>
        </nav>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          The Competitive Analysis Strategy Library
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Four competitive research strategies for finding who really ranks
          against you, measuring the gap honestly, and deciding what is worth
          taking. Each one includes a workflow and a copy-paste OpenSEO MCP
          prompt.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          How do you do a competitor analysis for SEO?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Not by filling in a template. Search ranks pages, not companies, so
          the useful sequence is to measure who holds the results you want,
          strip the noise out of the comparison, check whether their advantage
          is as large as the headline number suggests, and only then decide what
          to build. These four strategies run in that order.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {competitiveAnalysisStrategies.map((strategy, index) => {
            const number = String(index + 1).padStart(2, "0");
            return (
              <a
                key={strategy.href}
                href={strategy.href}
                className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 transition-colors hover:border-neutral-900"
              >
                <span className="font-mono text-sm tabular-nums text-[var(--color-brand-accent)]">
                  {number}
                </span>
                <h3 className="mt-3 text-base font-semibold text-neutral-950">
                  {strategy.title}
                  <span
                    aria-hidden="true"
                    className="ml-1 text-[var(--color-brand-accent)]"
                  >
                    &rarr;
                  </span>
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                  {strategy.description}
                </p>
              </a>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Why competitor analysis templates fail an SEO
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Most competitor analysis material is written for a business plan. It
          asks you to list rivals, tabulate their pricing and positioning, and
          summarise strengths and weaknesses. That document is worth writing and
          it will not tell you which page to publish next.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Search competition is decided per query, per page. The company you
          lose deals to may be invisible in your results, and a directory you
          have never thought about may hold three of the ten positions you want.
          A competitive analysis that is useful for SEO has to start from the
          SERP and work backwards, which is why every strategy here begins with
          measured data rather than a list of names.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What competitor analysis tools actually give you
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Every number in a competitive report is modelled from outside the
          business it describes. Ranked keywords are real, in that a crawler saw
          the position. Traffic estimates are not measurements. Authority scores
          are third-party inventions that Google does not read. Read them as
          tiers and trends, and the tooling becomes genuinely useful. Read them
          as facts and you will plan a quarter around a number nobody can spend.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          You can run the data-backed parts of these workflows with OpenSEO's{" "}
          <a
            href="/features/domain-overview"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            domain overview
          </a>{" "}
          and{" "}
          <a
            href="/features/backlink-checker"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            backlink checker
          </a>
          , or through the{" "}
          <a
            href="/docs/mcp"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            OpenSEO MCP
          </a>
          , which lets a compatible AI assistant compare domains, pull ranked
          keywords, and read link profiles while it works through the workflow.
          The{" "}
          <a
            href="/docs/skills/competitive-landscape"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            competitive landscape
          </a>{" "}
          and{" "}
          <a
            href="/docs/skills/competitor-analysis"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            competitor analysis
          </a>{" "}
          agent skills package the same steps as reusable commands.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Where competitive research meets keyword research
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          A competitive analysis ends with a list of terms, which is where the{" "}
          <a
            href="/library/keyword-research"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            keyword research library
          </a>{" "}
          picks the work up. The two overlap in three specific places.
        </p>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-700">
          <li>
            The keyword set you compare competitors on should come from customer
            language, not your own category page, which is the discipline in{" "}
            <a
              href="/library/keyword-research/seed-from-conversation"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              seeding from conversation
            </a>
            .
          </li>
          <li>
            Gap-sourced keywords still have to be grouped before they become
            pages, using{" "}
            <a
              href="/library/keyword-research/cluster-topical-hubs"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              topical hubs
            </a>{" "}
            and{" "}
            <a
              href="/library/keyword-research/search-intent-mapping"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              intent mapping
            </a>
            .
          </li>
          <li>
            Your own{" "}
            <a
              href="/library/keyword-research/gsc-programmatic-discovery"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              Search Console queries
            </a>{" "}
            are the one dataset in this whole exercise that is measured rather
            than estimated. Use them to check any competitive number that looks
            surprising.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Competitor analysis FAQ
        </h2>
        <div className="mt-5 divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-white">
          {faqs.map((faq) => (
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

      <section className="mt-12 flex flex-col items-start justify-between gap-4 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 sm:flex-row sm:items-center md:p-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Run a competitor analysis with your own agent
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-brand-muted)]">
            Each strategy ends with a copy-paste MCP prompt. OpenSEO is open
            source, free to try, and does not require a credit card.
          </p>
        </div>
        <a
          href="https://app.openseo.so/sign-up"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Start with OpenSEO
          <span aria-hidden="true" className="ml-2">
            &rarr;
          </span>
        </a>
      </section>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </article>
  );
}
