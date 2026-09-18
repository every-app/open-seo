import { createFileRoute } from "@tanstack/react-router";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";
import { linkBuildingStrategies } from "@/lib/strategy-libraries";

const PATH = "/library/link-building";

const faqs = [
  {
    question: "What is link building?",
    answer:
      "Getting other websites to link to yours, so that search engines and the people on those sites treat your pages as worth pointing at. The links that count come from sites about the same subject, and the number that moves rankings is how many different sites link, not how many links there are.",
  },
  {
    question: "Do backlinks still matter for SEO?",
    answer:
      "Yes, and the practitioners on the podcast think they may matter more as they get rarer. What has changed is which ones count: relevant sites in your field over high-scoring sites in another, and distinct referring domains over repeated links from the same one. AI search systems also lean on the same link-based authority signals.",
  },
  {
    question: "What is a good link building strategy for a small business?",
    answer:
      "Do things a local site would report: sponsor, join, host, clean up a park. Ask the businesses that share your customer and do not compete with you for a mention. Build one tool people in your field search for. Then count referring domains, not backlinks, and ignore the people emailing you to sell links.",
  },
  {
    question: "How many backlinks do I need to rank?",
    answer:
      "As many referring domains as the pages that outrank you have, from sites in the same field. The count of backlinks is a poor guide because a single site can supply hundreds of them. Check a competitor's profile for the referring domain number and the backlink gap analysis for the domains that link to them and not to you.",
  },
  {
    question: "How does OpenSEO help with link building?",
    answer:
      "The backlinks tool shows any domain's backlinks, referring domains, top linked pages, anchor text, dofollow or nofollow, domain rank, spam score and broken status, with filters and export. A free backlink checker shows the summary without an account. The MCP provides backlink summaries and individual backlink rows; use the app for the Top Pages table. The link-prospecting skill packages the competitor workflow.",
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
  { name: "Link Building", path: PATH },
]);

export const Route = createFileRoute("/_marketing/library/link-building/")({
  head: () =>
    buildPageSeo({
      title: "Link Building: The Strategy Library",
      description:
        "Three link building strategies from practitioners who build links for a living: audit a backlink profile without trusting the score, report referring domains instead of backlinks, and earn links from the pages that already get them. Each includes a workflow and an OpenSEO MCP prompt.",
      path: PATH,
      titleSuffix: "OpenSEO",
    }),
  component: LinkBuildingLibraryPage,
});

function LinkBuildingLibraryPage() {
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
          / <span>Link Building</span>
        </nav>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          The Link Building Strategy Library
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Three strategies for the person who has to grow a site&rsquo;s
          authority without a link budget: how to read a backlink profile
          without trusting the score, which number to report, and where the next
          links come from. Each one is built on a real profile and includes a
          copy-paste OpenSEO MCP prompt.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          How do you build links that count?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Read what you already have, count distinct sources, and look at which
          pages are already earning attention.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {linkBuildingStrategies.map((strategy, index) => {
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
          Why most link building produces the wrong links
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Link building is the part of SEO with the most sellers and the least
          measurement. The sellers sort the web by a score, and the score is
          easy to buy. On one real profile the three newest links came from a
          casino domain and two link sellers, unrequested, and the casino domain
          carried a higher domain rank than the relevant sites beneath it. A
          strategy built on the score would have counted that as a win.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          The practitioners on the Unscripted SEO podcast, people who build
          links for clients and test on their own sites, describe a different
          order of operations. Relevance first: a link from a site about your
          subject, to a page about that subject. Then diversity: how many
          different sites, not how many links. The three strategies above follow
          that order, and each one starts from a real backlink profile rather
          than a hypothetical one.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What OpenSEO backlink analysis shows
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Enter any domain, yours or a competitor&rsquo;s, and the overview
          reports backlinks, referring domains, referring pages, domain rank,
          spam score, and broken backlinks and pages, with a year of backlink
          and referring-domain history and new-versus-lost links by month. Three
          tables sit beneath it: every backlink with its source page, target
          page, anchor text, dofollow or nofollow flag, domain rank, spam score
          and first-seen date; every referring domain with its backlink count
          and issues; and your top pages by the links they attract.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          The backlink table shows one row per referring domain by default, or
          every individual link, and filters by domain rank, spam score, link
          type and source terms. Everything exports. The{" "}
          <a
            href="/backlink-checker"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            free backlink checker
          </a>{" "}
          shows the summary and top 15 links for any domain without an account.
          In the app, a domain overview costs about 50 credits and a page of 100
          backlink rows about 30.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          You can run all of it from the{" "}
          <a
            href="/features/backlink-checker"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            backlink checker
          </a>{" "}
          page. The{" "}
          <a
            href="/docs/mcp"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            OpenSEO MCP
          </a>{" "}
          gives an AI assistant the overview and backlink rows, alongside Search
          Console and keyword data in one conversation. Use the app for the Top
          Pages table. The{" "}
          <a
            href="/docs/skills/link-prospecting"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            link-prospecting skill
          </a>{" "}
          packages the competitor workflow.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Where link building ends
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Three things a backlink profile cannot tell you, and where to get
          them.
        </p>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-700">
          <li>
            Which domains link to your competitors and not to you. That is a
            comparison across profiles, and{" "}
            <a
              href="/library/competitive-analysis/backlink-gap-analysis"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              backlink gap analysis
            </a>{" "}
            in the competitive analysis library is the strategy for it.
          </li>
          <li>
            Whether the mention counted without a link. Unlinked brand mentions
            and citations are how AI assistants decide who to recommend; one
            guest cited data that most of what gets a brand named in an AI
            answer lives off its own domain.{" "}
            <a
              href="/features/ai-brand-visibility"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              AI brand visibility
            </a>{" "}
            measures that side; a backlink tool does not.
          </li>
          <li>
            Whether the page deserved the link. A page that earns links is
            usually a tool, a piece of data or an event, and{" "}
            <a
              href="/library/keyword-research/positioning-to-demand"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              positioning to demand
            </a>{" "}
            is how to decide what to build before you ask anyone to point at it.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Link building FAQ
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
            Read your backlink profile with your own agent
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-brand-muted)]">
            Each strategy ends with a copy-paste MCP prompt. OpenSEO is open
            source, free to start, and does not require a credit card.
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
