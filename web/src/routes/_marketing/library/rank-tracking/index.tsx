import { createFileRoute } from "@tanstack/react-router";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";
import { rankTrackingStrategies } from "@/lib/strategy-libraries";

const PATH = "/library/rank-tracking";

const faqs = [
  {
    question: "What is rank tracking?",
    answer:
      "Checking where a website appears in Google's results for a chosen set of keywords, from a chosen location and device, on a schedule, and recording the position each time so you can see movement. It answers a narrower question than Search Console, which reports an average position across every searcher, and a more precise one.",
  },
  {
    question: "How many keywords should I track?",
    answer:
      "Twenty to fifty for most sites. Take them from Search Console, where you can see which queries already show your site at positions 4 to 20 with real impressions, tie each one to a page that produces leads or revenue, and add one or two brand terms as a control. A tracker with 500 rows is a report nobody reads.",
  },
  {
    question: "How often should rankings be checked?",
    answer:
      "Weekly is the useful default. Positions move day to day for reasons that have nothing to do with your work, and a daily check mostly records that noise at about seven times the cost. Check daily during a migration or a launch, then go back to weekly.",
  },
  {
    question: "Should I track mobile or desktop rankings?",
    answer:
      "Mobile, unless you know your customers search from desktops. Most queries are mobile-first now and the two result pages differ. OpenSEO defaults to mobile and can track both, which doubles the cost of each check.",
  },
  {
    question: "Is Google Search Console a rank tracker?",
    answer:
      "Not quite. It reports an average position per query blended across devices, countries, and dates, for your own site only. Its 24-hour view shows recent preliminary data; finalized reports arrive later. That is enough for a single-location site that wants direction. A tracker adds a precise position per keyword and device, the ranking URL, SERP features, and competitors, and costs money for each check.",
  },
  {
    question: "How much does rank tracking cost in OpenSEO?",
    answer:
      "It depends on keywords, devices, depth, and schedule, and the app shows the estimate before anything runs. As a reference point, 100 keywords on mobile, checking the top 40 results weekly, comes to about a dollar a month in credits. Rank checks on the hosted app need the $10/month plan, which includes $10 of credits; self-hosted deployments pay their data provider directly.",
  },
  {
    question: "Can I track local rankings for a specific city?",
    answer:
      "Yes. Each rank tracker measures organic website rankings from a chosen location, so you can track the same keywords from several towns. For Business Profile positions in Maps, use the separate MCP local rank grid, which searches from each point of a 3x3 or 5x5 grid.",
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
  { name: "Rank Tracking", path: PATH },
]);

export const Route = createFileRoute("/_marketing/library/rank-tracking/")({
  head: () =>
    buildPageSeo({
      title: "Rank Tracking: The Strategy Library",
      description:
        "Four rank tracking strategies for people who report SEO upward without an SEO budget: pick the keywords, know where Search Console stops, track local positions properly, and write the report that gets read. Each includes a workflow and an OpenSEO MCP prompt.",
      path: PATH,
      titleSuffix: "OpenSEO",
    }),
  component: RankTrackingLibraryPage,
});

function RankTrackingLibraryPage() {
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
          / <span>Rank Tracking</span>
        </nav>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          The Rank Tracking Strategy Library
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Four strategies for the person who has to show someone a number every
          month: which keywords to track and how many, where Search
          Console&rsquo;s free data stops, how to track a local business from
          where its customers stand, and how to write the ranking report that
          gets read. Each one includes a workflow and a copy-paste OpenSEO MCP
          prompt.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          How do you track keyword rankings without wasting the budget?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Start from what Search Console already shows, track only what someone
          will read, measure local positions from where customers stand, and
          report movement as an explanation for the business number rather than
          a table.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {rankTrackingStrategies.map((strategy, index) => {
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
          Why rank tracking gets bought and then ignored
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          A rank tracker is the easiest SEO tool to justify and the easiest to
          stop reading. It gets bought because positions are the number everyone
          understands. It gets ignored because a table of 300 keywords with
          green and red arrows does not tell the person paying for it whether
          anything happened that matters, and after a couple of months they stop
          opening it.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          The fix is upstream of the tool. Track a short list chosen from Search
          Console, so every row is a query Google already shows your site for
          and a page that earns something. Then report positions as the
          explanation for what clicks did, not as the headline. The four
          strategies above are that sequence: choose, measure, measure locally
          if you are local, report.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What OpenSEO rank tracking checks
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          A tracker is a domain, a location, and a language. You choose the
          devices (mobile, desktop, or both; mobile by default), how deep to
          look (the top 10 to 100 results, 40 by default), and a schedule
          (manual, daily, weekly, or monthly). Each check records, per keyword
          and device, the position, the previous position, the URL that ranked,
          and the SERP features on the page. A tracker holds up to 1,000
          keywords, and a project can hold up to 500 trackers, which is how you
          track several locations for one business.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Creating a tracker and adding keywords cost nothing. Checks cost
          credits, and the app shows an estimate before every scheduled add and
          every live run. Scheduled checks go through a queue that is much
          cheaper per keyword than a one-off live check. The keyword count,
          devices, depth, and schedule multiply, so 100 keywords on mobile at
          depth 40, weekly, is about a dollar a month; both devices doubles it
          and daily checks multiply it by about seven.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          On the hosted app, rank checks need the $10/month plan, which includes
          $10 of credits each month; a free account can build a tracker but its
          checks will not run. Self-hosted deployments are not gated and pay
          their data provider directly. Search Console reads, which the
          strategies here lean on, use no credits on either.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          You can run all of it from the{" "}
          <a
            href="/features/rank-tracking"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            rank tracking
          </a>{" "}
          page, or through the{" "}
          <a
            href="/docs/mcp"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            OpenSEO MCP
          </a>
          , which exposes the tracker to an AI assistant: create it, estimate
          the cost, add and remove keywords, run a check, and read the latest
          positions, alongside Search Console and the local rank grid in the
          same conversation.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Where rank tracking ends
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Three things a tracker cannot tell you, and where to get them.
        </p>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-700">
          <li>
            Whether anyone clicked. Positions describe a results page; clicks
            describe what people did on it. Search Console is the record, and{" "}
            <a
              href="/library/keyword-research/gsc-programmatic-discovery"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              programmatic discovery with Search Console
            </a>{" "}
            is how to read it at scale. It is an incomplete record: a share of
            clicks arrive on queries Search Console never reports, which{" "}
            <a
              href="/blogs/dark-queries"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              The Dark Query Problem
            </a>{" "}
            explains and works around.
          </li>
          <li>
            Whether the keyword was worth it. A term can move from 14 to 4 and
            change nothing, because the demand was never there or the intent was
            wrong.{" "}
            <a
              href="/library/keyword-research/search-intent-mapping"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              Search-intent mapping
            </a>{" "}
            comes before the tracker, not after.
          </li>
          <li>
            Whether an AI assistant recommends you. Tools that monitor that are
            directional; answers are personalised and there is no first-party
            report behind them. Report it as a signal, next to the tracker,
            never as the same kind of number.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Rank tracking FAQ
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
            Track rankings with your own agent
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
