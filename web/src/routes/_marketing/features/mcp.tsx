import { createFileRoute } from "@tanstack/react-router";
import { buildPageSeo } from "@/lib/seo";

const mcpDescription =
  "Connect OpenSEO MCP so compatible AI clients can call keyword, SERP, domain, backlink, saved keyword, rank-tracking, and Google Search Console tools.";

const toolCategories = [
  {
    label: "Keywords",
    tools: [
      {
        title: "Research keywords",
        description: "Get keyword ideas with volume, difficulty, and CPC.",
      },
      {
        title: "Get SERP results",
        description: "See live Google organic results for a keyword.",
      },
      {
        title: "Save keywords",
        description: "Keep useful ideas organized in your OpenSEO project.",
      },
    ],
  },
  {
    label: "Competitive research",
    tools: [
      {
        title: "Get domain overview",
        description: "Summarize a domain's organic footprint.",
      },
      {
        title: "Get domain keywords",
        description: "Find keywords a domain already ranks for.",
      },
      {
        title: "Get backlinks overview",
        description: "Check backlink and referring-domain stats.",
      },
    ],
  },
  {
    label: "Search Console",
    tools: [
      {
        title: "Get GSC performance",
        description:
          "Read clicks, impressions, CTR, and position from the connected property.",
      },
      {
        title: "Inspect URLs",
        description:
          "Check index coverage, crawl, canonical, mobile, and rich-result signals.",
      },
      {
        title: "Use first-party data",
        description:
          "Run read-only Search Console calls for free with no OpenSEO credits.",
      },
    ],
  },
] as const;

const workflows = [
  {
    title: "Research with live SEO data",
    description:
      "Give Codex, Claude, and other MCP clients access to OpenSEO keyword, SERP, domain, backlink, saved keyword, rank-tracking, and Search Console data.",
  },
  {
    title: "Keep the agent focused",
    description:
      "Ask for a specific workflow like competitor analysis or keyword clustering instead of a vague SEO recommendation.",
  },
  {
    title: "Save useful output",
    description:
      "Let the agent save promising keywords back to OpenSEO so human review and rank tracking can happen in the same workspace.",
  },
];

export const Route = createFileRoute("/_marketing/features/mcp")({
  head: () =>
    buildPageSeo({
      title: "OpenSEO MCP",
      description: mcpDescription,
      path: "/features/mcp",
      titleSuffix: "OpenSEO",
    }),
  component: McpPage,
});

function McpPage() {
  return (
    <>
      <p className="text-sm font-medium text-neutral-500">OpenSEO MCP</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight leading-tight">
        OpenSEO MCP for AI SEO workflows
      </h1>
      <p className="mt-4 text-neutral-700 leading-relaxed">
        Connect OpenSEO to your AI agent so it can research keywords, inspect
        SERPs, compare competitors, summarize backlink context, save keyword
        opportunities, review rank-tracking data, and read first-party Search
        Console signals with live SEO context.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href="/docs/mcp"
          className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Set up OpenSEO MCP
        </a>
        <a
          href="/docs/skills"
          className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-300 px-5 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-900"
        >
          View OpenSEO skills
        </a>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">What it does</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          MCP lets compatible AI clients call OpenSEO research tools directly.
          After connecting OpenSEO through a supported MCP client, your agent
          can perform structured SEO research with data from your OpenSEO
          project instead of relying on generic guesses.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Useful workflows</h2>
        <ol className="mt-6 space-y-6">
          {workflows.map((workflow, index) => (
            <li
              key={workflow.title}
              className="grid grid-cols-[2.25rem_1fr] gap-x-4"
            >
              <span className="pt-[2px] font-mono text-sm tabular-nums text-neutral-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">
                  {workflow.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                  {workflow.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Available tool groups</h2>
        <div className="mt-5 grid gap-x-8 gap-y-8 md:grid-cols-3">
          {toolCategories.map((category) => (
            <div key={category.label}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {category.label}
              </h3>
              <ul className="mt-3 space-y-3">
                {category.tools.map((tool) => (
                  <li key={tool.title} className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-neutral-900">
                      {tool.title}
                    </span>
                    <p className="text-xs leading-relaxed text-neutral-600">
                      {tool.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">
          New: free Google Search Console MCP
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          OpenSEO MCP can read Search Console performance and URL inspection
          data from a connected hosted project. These tools are read-only and do
          not use OpenSEO credits.
        </p>
        <div className="mt-4">
          <a
            href="/google-search-console-mcp"
            className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-300 px-4 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-900"
          >
            Explore GSC MCP
          </a>
        </div>
      </section>

      <section className="mt-12 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
        <h2 className="text-lg font-semibold text-neutral-900">
          Setup lives in Docs
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          The MCP server URL, Claude setup, Codex setup, and troubleshooting
          steps are maintained in the docs so this feature page can stay focused
          on what OpenSEO MCP makes possible.
        </p>
        <div className="mt-4">
          <a
            href="/docs/mcp"
            className="inline-flex h-9 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Open MCP docs
          </a>
        </div>
      </section>
    </>
  );
}
