import { createFileRoute } from "@tanstack/react-router";
import { buildBreadcrumbJsonLd, buildPageSeo } from "@/lib/seo";
import { aiAgentSeoStrategies } from "@/lib/strategy-libraries";

const PATH = "/library/ai-agent-seo";

const faqs = [
  {
    question: "What is AI-agent SEO?",
    answer:
      "Doing SEO through an AI assistant that can call tools: reading Search Console, pulling keyword and SERP data, checking rankings, running a crawl, and drafting from the results, inside one conversation. It is a way of working, not a way of being found; how AI assistants decide to mention your brand is a separate subject covered by AI brand visibility.",
  },
  {
    question: "Can AI do SEO for me?",
    answer:
      "It can fetch, filter, sort and draft faster than a person. It cannot tell a bot query from a human one, decide which keywords are worth the budget, or know what a client will act on. The workflows here put an agent on the fetching and drafting and keep a person at the decisions and the final check.",
  },
  {
    question: "What is MCP and do I need it for SEO?",
    answer:
      "The Model Context Protocol lets an AI assistant call external tools and receive data. Without it the assistant knows only what it was trained on and what you paste in. With an SEO MCP server connected, it reads first-party and research data directly. OpenSEO's connects to Claude Code, Claude Desktop, Codex and Cursor.",
  },
  {
    question: "Which SEO tasks should be automated and which should not?",
    answer:
      "Automate anything with a fixed input and output and no judgement: scheduled rank checks, Search Console pulls, exports. Let an agent do variable-input work that a person reads: summaries, bucketing, drafts. Keep decisions with a person: what to track, what to build, what to say to the client, and any process you cannot yet write down.",
  },
  {
    question: "Should AI write my SEO content?",
    answer:
      "It should write the draft, from a brief a person wrote that carries the reader, the data and verbatim quotes. It should not write the brief, and a person should edit the result with a fact pass and a pass for machine-writing phrases. Teams that run the loop the other way round produce polished pages with nothing in them.",
  },
  {
    question: "How do I make an AI agent's SEO work repeatable?",
    answer:
      "Three habits: save the workflow as a skill file the assistant reads, give it a memory such as a project context it loads before each run, and have it log every tool call so each number in its output traces to a data source. A blank chat is the highest-variance way to use a model; these remove most of the variance.",
  },
  {
    question: "What does the OpenSEO MCP give an agent?",
    answer:
      "Search Console performance and URL inspection at no credit cost, keyword metrics and research, live SERP results, domain and backlink data, rank tracking with cost estimates, site audits, local rank grids, and the project's shared context. Agent skills for keyword research, competitor analysis, site audit, local SEO, link prospecting, reporting and project setup install alongside it.",
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
  { name: "AI-Agent SEO", path: PATH },
]);

export const Route = createFileRoute("/_marketing/library/ai-agent-seo/")({
  head: () =>
    buildPageSeo({
      title: "AI-Agent SEO: The Strategy Library",
      description:
        "Four strategies for running SEO through an AI assistant: connect the MCP and run the first five prompts, decide what a schedule does and what stays with a person, keep the brief human, and make a good run repeatable with skills, memory and a trace. Each includes a workflow and an OpenSEO MCP prompt.",
      path: PATH,
      titleSuffix: "OpenSEO",
    }),
  component: AiAgentSeoLibraryPage,
});

function AiAgentSeoLibraryPage() {
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
          / <span>AI-Agent SEO</span>
        </nav>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          The AI-Agent SEO Strategy Library
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Four strategies for the person who already has Claude, Codex or Cursor
          open and wants the SEO work to happen there: what to connect and the
          first five prompts, what a schedule does and what stays with a person,
          why the brief is the human&rsquo;s job, and how to make a good run
          happen again. Every one is built on real runs through the OpenSEO MCP
          and ends with a copy-paste prompt.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          How do you run SEO through an AI agent without losing the plot?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Give the agent the data, keep the decisions, write the brief yourself,
          and make every run leave a trace.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {aiAgentSeoStrategies.map((strategy, index) => {
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
          Why this is a different library from AI visibility
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Two things get called &ldquo;AI SEO&rdquo; and they point in opposite
          directions. One is you using an AI assistant to do the work: pull the
          data, run the audit, draft the page. The other is an AI assistant
          mentioning your brand when someone asks it a question. This library is
          the first. It never tells you how to be read by a model; it tells you
          how to get the work done through one, and where the person stays.
          Being cited is the subject of{" "}
          <a
            href="/features/ai-brand-visibility"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            AI brand visibility
          </a>
          .
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          The practitioners in these four pages run SEO through agents every
          day, for clients and on their own sites, and they agree on more than
          you would expect: the agent is a fast driver with a short attention
          span, the person is the dispatcher, the brief is where the knowledge
          lives, and the run that cannot be repeated was not worth the tokens.
          Every strategy is built on a real call through the OpenSEO MCP,
          including the one where the data came back with an AI agent&rsquo;s
          own prompt in it.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What the OpenSEO MCP gives an agent
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          One server, connected to Claude Code, Claude Desktop, Codex or Cursor.
          Through it the assistant reads Search Console performance and URL
          inspection for a connected property at no credit cost, pulls keyword
          metrics and research, fetches live SERP results, reads domain and
          backlink data, creates and runs rank trackers with a cost estimate
          first, starts and reads site audits, runs local rank grids, and reads
          and updates the project&rsquo;s shared context. Research calls that
          hit a data provider use credits and say so before they run.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Alongside it, the{" "}
          <a
            href="/docs/skills"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            agent skills
          </a>{" "}
          are SKILL.md files that tell the assistant how to use those tools for
          one job each: keyword research, competitor analysis, site audit, local
          SEO, link prospecting, reporting, and project setup, with an SEO coach
          that picks the workflow if you are not sure. The{" "}
          <a
            href="/google-search-console-mcp"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            Search Console MCP
          </a>{" "}
          needs no Google Cloud project or OAuth setup of your own. Setup for
          each client is in the{" "}
          <a
            href="/docs/mcp"
            className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            MCP docs
          </a>
          .
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Where this library ends
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Three things an agent workflow cannot give you, and where to get them.
        </p>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-700">
          <li>
            Whether an AI assistant recommends you. That is the other direction
            of the arrow, measured by{" "}
            <a
              href="/features/ai-brand-visibility"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              AI brand visibility
            </a>{" "}
            and{" "}
            <a
              href="/features/ai-search-prompts"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              AI search prompts
            </a>
            , and driven by the same things that drive Google: relevant links,
            mentions and a site that answers the question.
          </li>
          <li>
            The judgement about which keyword is worth it. An agent can list
            every query at positions 4 to 20 in seconds;{" "}
            <a
              href="/library/keyword-research/search-intent-mapping"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              search-intent mapping
            </a>{" "}
            is how a person decides which of them to want.
          </li>
          <li>
            The number the business reads. An agent drafts the report from the{" "}
            <a
              href="/features/rank-tracking"
              className="font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
            >
              rank tracker
            </a>{" "}
            and Search Console; the shape that gets read is one a person gives
            it.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          AI-agent SEO FAQ
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
            Connect the MCP and run the first prompt
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
