import { createFileRoute } from "@tanstack/react-router";
import { featureGroups } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const featuresDescription =
  "Explore OpenSEO's open-source SEO tools for AI-agent workflows, Google Search Console MCP, keyword research, rank tracking, backlinks, site audits, competitor analysis, and AI visibility.";

export const Route = createFileRoute("/_marketing/features/")({
  head: () =>
    buildPageSeo({
      title: "OpenSEO Features",
      description: featuresDescription,
      path: "/features",
      titleSuffix: "OpenSEO",
    }),
  component: FeaturesIndex,
});

function FeaturesIndex() {
  return (
    <>
      <p className="text-sm font-medium text-neutral-500">
        Open-source SEO tools
      </p>
      <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
        A delightful suite of SEO tools
      </h1>
      <p className="mt-4 leading-relaxed text-neutral-700">
        Research keywords, track rankings, audit sites, and understand your AI
        visibility from one modern platform.
      </p>

      <div className="mt-10 space-y-12">
        <section>
          <div className="border-b border-neutral-200 pb-3">
            <h2 className="text-xl font-semibold text-neutral-900">
              AI agent workflows
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              Let supported MCP clients research keywords, SERPs, domains,
              backlinks, and first-party Search Console data through OpenSEO.
            </p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <a
              href="/features/mcp"
              className="block rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-900"
            >
              <p className="text-xs font-medium text-neutral-500">
                OpenSEO MCP
              </p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-900">
                OpenSEO MCP for your AI agent
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Connect OpenSEO to Claude, Codex, and supported MCP clients so
                agents can call OpenSEO research tools with authorized project
                context.
              </p>
              <p className="mt-3 text-sm font-medium text-neutral-900">
                Explore MCP <span aria-hidden="true">&rarr;</span>
              </p>
            </a>
            <a
              href="/google-search-console-mcp"
              className="block rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-900"
            >
              <p className="text-xs font-medium text-neutral-500">
                Search Console MCP
              </p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-900">
                Free Google Search Console MCP
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Let your agent read clicks, impressions, CTR, position, and URL
                inspection data from your connected Search Console property.
              </p>
              <p className="mt-3 text-sm font-medium text-neutral-900">
                Explore GSC MCP <span aria-hidden="true">&rarr;</span>
              </p>
            </a>
          </div>
        </section>

        {featureGroups.map((group) => (
          <section key={group.label}>
            <div className="border-b border-neutral-200 pb-3">
              <h2 className="text-xl font-semibold text-neutral-900">
                {group.label}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                {group.description}
              </p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {group.pages.map((page) => (
                <a
                  key={page.slug}
                  href={`/features/${page.slug}`}
                  className="rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-900"
                >
                  <p className="text-xs font-medium text-neutral-500">
                    {page.eyebrow}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-neutral-900">
                    {page.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    {page.description}
                  </p>
                  <p className="mt-3 text-sm font-medium text-neutral-900">
                    Explore feature <span aria-hidden="true">&rarr;</span>
                  </p>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
