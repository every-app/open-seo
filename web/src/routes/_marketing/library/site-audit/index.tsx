import { createFileRoute } from "@tanstack/react-router";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";
import { siteAuditStrategies } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit";

const faqs = [
  {
    question: "What is a technical SEO audit?",
    answer:
      "A check of whether search engines can reach, render, and understand your pages. It covers crawl access, status codes, canonical and indexability signals, titles and headings, internal linking, duplicate content, and response time. It comes before content and link work, because a content problem on a page Google cannot fetch is not the problem you have.",
  },
  {
    question: "What should a technical SEO audit checklist produce?",
    answer:
      "A work order rather than a count. Group findings by issue type instead of by URL, keep only the issues that stop a page being reached or understood in front of the reader, and attach the specific remediation to each one. A report of 1,180 findings across 318 pages usually describes about a dozen underlying causes.",
  },
  {
    question: "Why do SEO audits produce so many issues?",
    answer:
      "Because most checks run per page and most sites are templated, so one template fault multiplies by every page using it. Two hundred and seventy-nine pages missing a meta description is one template change, not 279 tasks. Grouping by cause is what turns the number back into work.",
  },
  {
    question: "What is index bloat, and how do I know if I have it?",
    answer:
      "More URLs eligible for indexing than the site has distinct things to say: pagination, filter parameters, tag archives, and per-item permalinks. A crawler cannot tell you whether you have it, because every bloated page returns 200 and passes its own checks. Inspect a sample of the suspect URLs in Search Console instead. If they come back unknown to Google or canonicalised away, there is nothing to delete.",
  },
  {
    question: "Why did my SEO crawler get blocked?",
    answer:
      "A bot-protection layer refused it, usually with a 403, a 429 rate limit, or a managed challenge, and usually from the CDN edge rather than your server. Googlebot is normally exempt because vendors verify it by reverse DNS; third-party crawlers are not. Until access is fixed, every other number in the audit covers only the pages that were served.",
  },
  {
    question: "Is there a free SEO audit tool?",
    answer:
      "Partly. Google Search Console reports coverage and indexing for your own verified property at no cost, and it is more reliable than any third-party estimate for anything Google-specific. A crawler adds the on-page and internal-link picture Search Console does not give you. OpenSEO is open source and free to start, with 50-page crawls on the free plan; the paid plan is $10/month and raises the limit to 10,000 pages per crawl.",
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
  { name: "Site Audit", path: PATH },
]);

export const Route = createFileRoute("/_marketing/library/site-audit/")({
  head: () =>
    buildPageSeo({
      title: "Technical SEO Audit: The Strategy Library",
      description:
        "Three site audit strategies for turning a crawl into scheduled work: triage by severity, report it so it gets approved, and decide what to delete. Each includes a workflow and an OpenSEO MCP prompt.",
      path: PATH,
      titleSuffix: "OpenSEO",
    }),
  component: SiteAuditLibraryPage,
});

function SiteAuditLibraryPage() {
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
          / <span>Site Audit</span>
        </nav>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          The Site Audit Strategy Library
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Three strategies for turning a crawl into scheduled work: triage the
          findings by severity, write the report so it gets approved, and decide
          which pages should stop existing. Each one includes a workflow and a
          copy-paste OpenSEO MCP prompt.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          How do you run a site audit that ends in fixes?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Sort the findings by severity, decide which are worth someone&rsquo;s
          sprint, and write the case so the work gets authorised. Deleting pages
          is a separate decision that needs its own evidence.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {siteAuditStrategies.map((strategy, index) => {
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
          Why most audits stop one step short
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          A crawler is good at finding problems and has no opinion about which
          of them matter to your business. So the output is a list, the list is
          long, and the expensive work of deciding what to do with it gets
          deferred until nobody remembers why the crawl was run. Audits do not
          fail because the findings are wrong. They fail because a correct
          description of 1,180 problems gives the person paying for it no way to
          decide anything.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Two habits close most of that gap. Group findings by their underlying
          cause rather than by URL, because a templated site turns one mistake
          into hundreds of rows. And carry the remediation with the finding, so
          the person reading the report is not sent off to search for what a
          canonical conflict is before they can act.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What the OpenSEO site audit checks
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          The crawler is robots.txt-aware and stays on the same origin. It
          checks 27 issue types across three severities: four critical (a
          blocked crawler, a 5xx error, a broken internal link, a missing
          title), 14 warnings covering duplicate titles and descriptions,
          duplicate content, missing or multiple H1s, redirect chains and loops,
          canonical conflicts, thin content, missing image alt text, orphan
          pages and dead ends, and nine informational checks for length, heading
          order, response time, and intentional noindex or canonical signals.
          Every issue carries a <code>how_to_fix</code> written for that issue
          type.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          You can run all of it from the{" "}
          <a
            href="/features/site-audit"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            site audit
          </a>{" "}
          page, or through the{" "}
          <a
            href="/docs/mcp"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            OpenSEO MCP
          </a>
          , which lets a compatible AI assistant start the crawl, poll it, read
          the issues with their fixes, and cross-check individual URLs against
          Google Search Console in one conversation. The{" "}
          <a
            href="/docs/skills/seo-audit"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            seo-audit
          </a>{" "}
          agent skill packages the same steps as a reusable command.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Free accounts can crawl 50 pages per audit, which covers most brochure
          sites. Larger crawls run to 10,000 pages on the $10/month plan.
          Lighthouse is optional and samples up to 10 representative pages
          rather than every URL.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Where the audit needs data the crawl does not have
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Two of the most valuable audit outcomes are decisions rather than
          defects, and no crawler will surface either as a row.
        </p>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-700">
          <li>
            Which broken pages anyone was ever going to visit. Severity is a
            property of the issue; value is a property of the page. Cross the
            critical list against your{" "}
            <a
              href="/library/keyword-research/gsc-programmatic-discovery"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              Search Console queries and pages
            </a>{" "}
            and the fixes that matter separate from the ones that are merely
            correct.
          </li>
          <li>
            Whether a wall of near-identical URLs is in the index at all. A
            crawler reports 800 healthy pages; URL inspection tells you Google
            never fetched 795 of them.
          </li>
          <li>
            Whether a competitor&rsquo;s advantage is technical or structural.
            Before rebuilding a template, check the{" "}
            <a
              href="/library/competitive-analysis/find-your-real-competitors"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              domains that actually hold your results
            </a>
            , because half of them are frequently directories you were never
            going to outrank.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Site audit FAQ
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
            Run a site audit with your own agent
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
