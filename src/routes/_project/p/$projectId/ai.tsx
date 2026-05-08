import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";
const SUPPORT_EMAIL = "ben@openseo.so";
const SAM_GITHUB_URL = "https://github.com/every-app/sam";
const CHATGPT_MCP_DOCS_URL = "https://platform.openai.com/docs/mcp";
const CLAUDE_CONNECTORS_DOCS_URL =
  "https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers";

const mcpTools = [
  {
    name: "whoami",
    description:
      "Check which OpenSEO user and workspace the client can access.",
  },
  {
    name: "list_projects",
    description: "Find your OpenSEO projects and copy the right projectId.",
  },
  {
    name: "research_keywords",
    description:
      "Turn seed terms into keyword ideas with volume, difficulty, and CPC.",
  },
  {
    name: "get_serp_results",
    description:
      "Inspect live Google results for keyword and competitor research.",
  },
  {
    name: "get_domain_overview",
    description:
      "Summarize a domain's organic footprint before deeper research.",
  },
  {
    name: "get_domain_keyword_suggestions",
    description:
      "Find keywords a domain already ranks for or could expand into.",
  },
  {
    name: "get_backlinks_overview",
    description: "Review backlink authority and referring-domain signals.",
  },
  {
    name: "get_rank_tracker",
    description: "Read your tracked keyword positions from OpenSEO.",
  },
  {
    name: "list_saved_keywords",
    description: "Pull saved keyword lists into an agent workflow.",
  },
  {
    name: "save_keywords",
    description: "Save promising keyword ideas back to OpenSEO.",
  },
] as const;

const promptExamples = [
  {
    title: "Keyword research",
    prompt:
      "Use OpenSEO to research keywords for my project. Start with these seed topics: [seed 1], [seed 2], [seed 3]. Group the best opportunities by search intent, prioritize low-difficulty terms, and suggest which keywords I should save.",
  },
  {
    title: "Competitor research",
    prompt:
      "Use OpenSEO to compare my domain [yourdomain.com] against these competitors: [competitor1.com], [competitor2.com]. Summarize their strongest keyword themes, backlink advantages, and the first content opportunities I should pursue.",
  },
  {
    title: "SERP brief",
    prompt:
      "Use OpenSEO to inspect the live SERP for [keyword]. Tell me who ranks, what search intent Google is rewarding, what pages are cited repeatedly, and what a better page should include.",
  },
] as const;

export const Route = createFileRoute("/_project/p/$projectId/ai")({
  component: AiPage,
});

function AiPage() {
  const mcpUrl =
    typeof window === "undefined"
      ? "https://app.openseo.so/mcp"
      : `${window.location.origin}/mcp`;

  return (
    <div className="px-4 py-12 md:px-6 md:py-20 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">AI & MCP</h1>
        <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
          Connect OpenSEO to your coding agent or AI workspace so it can run SEO
          research with your project data: keyword ideas, SERP results, domain
          overviews, backlinks, rank tracking, and saved keywords.
        </p>
        <p className="mt-3 text-sm text-base-content/70 leading-relaxed">
          This is community-driven — we want to hear what matters to you. Reach
          out on{" "}
          <a
            className="link link-primary"
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
          >
            Discord
          </a>{" "}
          or email{" "}
          <a className="link link-primary" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">MCP server</h2>
          <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
            Use this endpoint when a client asks for the OpenSEO MCP server URL.
            You will be sent through OpenSEO login the first time a client
            connects.
          </p>
          <div className="mt-4 rounded-lg border border-base-300 bg-base-200/50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
              MCP endpoint
            </p>
            <code className="mt-2 block break-all text-sm text-base-content">
              {mcpUrl}
            </code>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Connect Codex</h2>
          <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
            Codex supports hosted MCP servers from the CLI. Add OpenSEO, then
            run the OAuth login flow.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-base-300 bg-base-200/50 p-4 text-xs leading-relaxed text-base-content">
            <code>{`codex mcp add openseo --url ${mcpUrl}
codex mcp login openseo`}</code>
          </pre>
          <p className="mt-3 text-sm text-base-content/70 leading-relaxed">
            After login, ask Codex to call <code>whoami</code>, then{" "}
            <code>list_projects</code>. Use the returned <code>projectId</code>{" "}
            for keyword, SERP, domain, backlink, and rank-tracking requests.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Connect Claude Code CLI</h2>
          <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
            Claude Code can add OpenSEO as an HTTP MCP server. Use the user
            scope if you want it available across projects, or local scope if
            this repository is the only place you need it.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-base-300 bg-base-200/50 p-4 text-xs leading-relaxed text-base-content">
            <code>{`claude mcp add --transport http --scope user openseo ${mcpUrl}`}</code>
          </pre>
          <p className="mt-3 text-sm text-base-content/70 leading-relaxed">
            If Claude Code prompts you to authorize the server, approve the
            OpenSEO login flow. Then ask it to list MCP tools or call{" "}
            <code>whoami</code> to confirm the connection.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">
            ChatGPT, Claude web, and Claude Desktop
          </h2>
          <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
            Web AI clients handle MCP setup differently from coding tools. Use
            the same endpoint above when adding a custom connector or MCP
            server, then authorize OpenSEO when the client asks you to sign in.
          </p>
          <ul className="mt-4 space-y-3">
            <li className="flex gap-2.5 text-sm text-base-content/70">
              <span className="mt-[2px] shrink-0 text-base-content/40">
                &mdash;
              </span>
              <span>
                In ChatGPT, enable developer mode if needed, then create a
                custom MCP connector from Apps & Connectors and use the endpoint
                above.
              </span>
            </li>
            <li className="flex gap-2.5 text-sm text-base-content/70">
              <span className="mt-[2px] shrink-0 text-base-content/40">
                &mdash;
              </span>
              <span>
                In Claude web or Claude Desktop, add OpenSEO from Settings,
                Connectors. Remote MCP servers should be added there, not by
                editing the desktop JSON config.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-sm text-base-content/70 leading-relaxed">
            Start by asking the client to check <code>whoami</code> and{" "}
            <code>list_projects</code>. Once it can see your projects, it can
            help with research planning, SERP analysis, competitor comparisons,
            and saving useful keywords back to OpenSEO.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <a
              href={CHATGPT_MCP_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-base-content transition-colors hover:text-base-content/60"
            >
              ChatGPT MCP docs
              <ArrowUpRight className="size-3.5" />
            </a>
            <a
              href={CLAUDE_CONNECTORS_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-base-content transition-colors hover:text-base-content/60"
            >
              Claude connector docs
              <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Available tools</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {mcpTools.map((tool) => (
              <div
                key={tool.name}
                className="rounded-lg border border-base-300 bg-base-100 p-4"
              >
                <code className="text-sm font-medium text-base-content">
                  {tool.name}
                </code>
                <p className="mt-2 text-sm leading-relaxed text-base-content/70">
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Prompts to try</h2>
          <div className="mt-4 space-y-4">
            {promptExamples.map((example) => (
              <div
                key={example.title}
                className="rounded-lg border border-base-300 bg-base-100 p-4"
              >
                <h3 className="text-sm font-medium">{example.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-base-content/70">
                  {example.prompt}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Sam: AI SEO teammate</h2>
          <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
            Sam is an experimental content workflow for Claude Code and other
            coding agents. It combines keyword research, source discovery,
            drafting, and QA for teams that want an agent to help produce
            publishable SEO content.
          </p>
          <a
            href={SAM_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-base-content transition-colors hover:text-base-content/60"
          >
            View Sam on GitHub
            <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Roadmap</h2>
          <ul className="mt-4 space-y-4">
            {[
              {
                title: "In-app SEO Research Agent",
                description:
                  "Ask questions and run research without leaving OpenSEO",
              },
              {
                title: "Content Assistant",
                description:
                  "Generate drafts using saved keywords and business context",
              },
              {
                title: "More MCP clients",
                description:
                  "Better setup guidance for ChatGPT, Claude web, OpenCode, and other clients as their MCP support matures",
              },
            ].map((item) => (
              <li key={item.title}>
                <p className="flex gap-2.5 text-sm text-base-content/70">
                  <span className="mt-[2px] shrink-0 text-base-content/40">
                    &mdash;
                  </span>
                  <span>
                    <span className="font-medium text-base-content">
                      {item.title}
                    </span>
                    {item.description ? (
                      <>
                        <br />
                        {item.description}
                      </>
                    ) : null}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
