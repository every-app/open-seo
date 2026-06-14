import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { featureGroups } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const featuresDescription =
  "Explore OpenSEO's open-source SEO tools for AI-agent workflows, Google Search Console MCP, keyword research, rank tracking, backlinks, site audits, competitor analysis, and AI visibility.";

export const Route = createFileRoute("/_marketing/features/")({
  head: () =>
    buildPageSeo({
      title: "Features",
      description: featuresDescription,
      path: "/features",
      titleSuffix: "OpenSEO",
    }),
  component: FeaturesIndex,
});

function FeaturesIndex() {
  return (
    <article className="mx-auto max-w-5xl">
      <p className="text-sm font-medium text-[var(--color-brand-accent)]">
        Open-source SEO tools
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
        All the tools you need, in one workspace
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
        Research keywords, track rankings, audit sites, and understand your AI
        visibility from one modern platform.
      </p>

      <div className="mt-12 space-y-12">
        <section>
          <div className="border-b border-[var(--color-border-subtle)] pb-4">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
              AI agent workflows
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
              Let supported MCP clients research keywords, SERPs, domains,
              backlinks, and first-party Search Console data through OpenSEO.
            </p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FeatureCard href="/features/mcp">
              <p className="text-xs font-medium text-[var(--color-brand-accent)]">
                OpenSEO MCP
              </p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-950">
                OpenSEO MCP
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                Connect Claude, Codex, and other agents to OpenSEO research
                tools.
              </p>
              <p className="mt-4 text-sm font-medium text-neutral-950">
                Explore MCP <span aria-hidden="true">&rarr;</span>
              </p>
            </FeatureCard>
            <FeatureCard href="/google-search-console-mcp">
              <p className="text-xs font-medium text-[var(--color-brand-accent)]">
                Search Console MCP
              </p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-950">
                Google Search Console MCP
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                Give agents access to clicks, impressions, CTR, position, and
                URL inspection.
              </p>
              <p className="mt-4 text-sm font-medium text-neutral-950">
                Explore GSC MCP <span aria-hidden="true">&rarr;</span>
              </p>
            </FeatureCard>
          </div>
        </section>

        {featureGroups.map((group) => (
          <section key={group.label}>
            <div className="border-b border-[var(--color-border-subtle)] pb-4">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
                {group.label}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
                {group.description}
              </p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {group.pages.map((page) => (
                <FeatureCard key={page.slug} href={`/features/${page.slug}`}>
                  <p className="text-xs font-medium text-[var(--color-brand-accent)]">
                    {page.eyebrow}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-neutral-950">
                    {page.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                    {page.navDescription}
                  </p>
                  <p className="mt-4 text-sm font-medium text-neutral-950">
                    Explore feature <span aria-hidden="true">&rarr;</span>
                  </p>
                </FeatureCard>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function FeatureCard({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 transition-colors hover:border-neutral-900"
    >
      {children}
    </a>
  );
}
