import { createFileRoute } from "@tanstack/react-router";
import { buildPageSeo } from "@/lib/seo";
import {
  competitiveAnalysisStrategies,
  keywordResearchStrategies,
} from "@/lib/strategy-libraries";

const PATH = "/library";
const description =
  "Browse practical SEO strategies for finding search demand, sizing up competitors, mapping intent, and planning pages.";
const featuredStrategies = [
  ...keywordResearchStrategies.slice(0, 2),
  ...competitiveAnalysisStrategies.slice(0, 2),
];

export const Route = createFileRoute("/_marketing/library/")({
  head: () =>
    buildPageSeo({
      title: "SEO Strategy Library",
      description,
      path: PATH,
      titleSuffix: "OpenSEO",
    }),
  component: StrategyLibraryIndexPage,
});

function StrategyLibraryIndexPage() {
  return (
    <article className="mx-auto max-w-5xl">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Resources
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          SEO Strategy Library
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Find search demand and decide which pages to build. Strategies are
          grouped by topic so you can start with the problem you need to solve.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Browse by topic
        </h2>
        <div className="mt-5 grid gap-4">
          <a
            href="/library/keyword-research"
            className="block rounded-lg border border-[var(--color-border-subtle)] bg-white p-6 transition-colors hover:border-neutral-900"
          >
            <h3 className="text-2xl font-semibold tracking-tight text-neutral-950">
              Keyword Research
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-brand-muted)]">
              Start with customer language, expand into long-tail demand, map
              search intent, and decide which opportunities deserve a page.
            </p>
            <p className="mt-5 text-sm font-medium text-neutral-950">
              View all {keywordResearchStrategies.length} strategies{" "}
              <span aria-hidden="true">&rarr;</span>
            </p>
          </a>
          <a
            href="/library/competitive-analysis"
            className="block rounded-lg border border-[var(--color-border-subtle)] bg-white p-6 transition-colors hover:border-neutral-900"
          >
            <h3 className="text-2xl font-semibold tracking-tight text-neutral-950">
              Competitive Analysis
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-brand-muted)]">
              Find out which domains really hold your search results, measure
              the keyword and link gap honestly, and decide what is worth
              taking.
            </p>
            <p className="mt-5 text-sm font-medium text-neutral-950">
              View all {competitiveAnalysisStrategies.length} strategies{" "}
              <span aria-hidden="true">&rarr;</span>
            </p>
          </a>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Start with a strategy
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          Go straight to a workflow if you already know what you need to do.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {featuredStrategies.map((strategy) => (
            <a
              key={strategy.href}
              href={strategy.href}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 transition-colors hover:border-neutral-900"
            >
              <h3 className="text-base font-semibold text-neutral-950">
                {strategy.title} <span aria-hidden="true">&rarr;</span>
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                {strategy.description}
              </p>
            </a>
          ))}
        </div>
      </section>
    </article>
  );
}
