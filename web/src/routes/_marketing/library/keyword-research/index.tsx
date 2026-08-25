import { createFileRoute } from "@tanstack/react-router";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";
import { keywordResearchStrategies } from "@/lib/strategy-libraries";

const PATH = "/library/keyword-research";

const faqs = [
  {
    question: "How do you do keyword research for SEO?",
    answer:
      "Seed from customer language, expand into long-tails and questions, label by intent, cluster into one-page-per-intent hubs, then validate against Search Console. Volume is the final filter, not the starting point.",
  },
  {
    question: "How do you do keyword research for free?",
    answer:
      "The discovery half runs on sources you already have: customer conversations, Google's autocomplete and People Also Ask, and your Search Console. Quality SEO data costs money, which is why the big SEO suites run $100/month and up. You can start OpenSEO for free; the paid plan starts at $10/month and includes $10 of usage. If you need more, you can buy top-up credits.",
  },
  {
    question: "Can you do keyword research without Google Keyword Planner?",
    answer:
      "Yes. Keyword Planner combines close variants and reports approximate search-volume data designed for ad planning. Use it to sanity-check commercial value rather than as your only source for discovering topics.",
  },
  {
    question: "What are the 3 types of keywords?",
    answer:
      "There is no universal set of three. OpenSEO uses four intent types: informational, navigational, commercial, and transactional. By shape, terms are often grouped as head, mid-tail, and long-tail.",
  },
  {
    question: "How do you do keyword research for a blog?",
    answer:
      "Blogs win in the tail: mine questions, cluster them into topical hubs, and let each post own one question-intent completely rather than skimming ten.",
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
  { name: "Keyword Research", path: PATH },
]);

export const Route = createFileRoute("/_marketing/library/keyword-research/")({
  head: () =>
    buildPageSeo({
      title: "How to Do Keyword Research: The Strategy Library",
      description:
        "Eight demand-discovery strategies drawn from interviews with working SEOs, each with a workflow and an OpenSEO MCP prompt for its data-backed steps.",
      path: PATH,
      titleSuffix: "OpenSEO",
    }),
  component: KeywordResearchLibraryPage,
});

function KeywordResearchLibraryPage() {
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
          / <span>Keyword Research</span>
        </nav>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          The Keyword Research Strategy Library
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Eight demand-discovery strategies drawn from interviews with working
          SEOs, each with a workflow and an OpenSEO MCP prompt for its
          data-backed steps.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          How to do keyword research through demand discovery
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Most guides teach you to export a volume report and sort descending.
          These strategies start earlier, where demand originates: customer
          language, question mining, your own Search Console. They end with
          pages mapped to intent, not keywords stuffed into paragraphs. Each
          strategy includes a walkthrough and a copy-paste MCP prompt for its
          data-backed steps.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {keywordResearchStrategies.map((strategy, index) => {
            const number = String(index + 1).padStart(2, "0");
            const body = (
              <>
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
              </>
            );
            return (
              <a
                key={strategy.href}
                href={strategy.href}
                className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 transition-colors hover:border-neutral-900"
              >
                {body}
              </a>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          How to supplement Google Keyword Planner
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Keyword Planner is built for planning search-ad campaigns. Its
          historical metrics combine close variants and report approximate
          monthly searches, so treat them as directional rather than a complete
          content-discovery dataset.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          The strategies in this library supplement it with three sources you
          can inspect: your customers' language (strategy 01), Google's own
          question surfaces (strategy 02), and your Search Console reality
          (strategy 05). Volume data still matters, but it is most useful after
          you understand the customer language and search intent.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Free sources for keyword discovery
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Google's free surfaces (autocomplete, People Also Ask) plus your own
          Search Console support the discovery. You can run the data-backed
          parts of these workflows with{" "}
          <a
            href="/features/keyword-research"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            OpenSEO's keyword research
          </a>{" "}
          and your connected Search Console. OpenSEO is open source and
          self-hostable, and its{" "}
          <a
            href="/docs/mcp"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            MCP
          </a>{" "}
          lets a compatible AI assistant query both sources while it works
          through the workflow. Quality SEO data is why the big suites run
          $100/month and up; OpenSEO's paid plan starts at $10/month and includes
          $10 of usage, with top-ups available if you need more. You can start
          for free.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Keyword research FAQ
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
            The Keyword Research Playbook
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-brand-muted)]">
            Eight interview-backed strategies and a seed-to-brief checklist in a
            working PDF. Ungated.
          </p>
        </div>
        <a
          href="/library/keyword-research/keyword-research-playbook.pdf"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Download the playbook
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
