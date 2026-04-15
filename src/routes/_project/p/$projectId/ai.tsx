import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";
const SUPPORT_EMAIL = "ben@openseo.so";
const SAM_GITHUB_URL = "https://github.com/every-app/sam";
const DATAFORSEO_MCP_DOCS_URL =
  "https://dataforseo.com/help-center/setting-up-the-official-dataforseo-mcp-server-simple-guide";

export const Route = createFileRoute("/_project/p/$projectId/ai")({
  component: AiPage,
});

function AiPage() {
  return (
    <div className="px-4 py-12 md:px-6 md:py-20 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">AI & Agents</h1>
        <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
          OpenSEO is brand new. Our goal is to build the most powerful and
          intuitive tool to help your websites rank better. AI will play a large
          role in that.
        </p>
        <p className="mt-3 text-sm text-base-content/70 leading-relaxed">
          Lots of other SEO tools have an overwhelming number of
          &ldquo;features&rdquo;. We think many of these can be hidden by
          default, only shown to you when you want them.
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

        {/* Sam */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Sam: AI SEO Teammate</h2>
          <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
            Sam turns your Claude Code or favorite coding agent into a powerful
            SEO teammate. Sam has a specialized workflow for writing great
            content, but you can teach Sam about your SEO workflow and needs and
            it will customize itself for you.
          </p>
          <p className="mt-3 text-sm text-base-content/70 leading-relaxed">
            Sam handles keyword research, source discovery, and drafting — with
            a built-in QA loop that checks quality and accuracy before you
            publish.
          </p>
          <p className="mt-3 text-sm text-base-content/70 leading-relaxed">
            Works with DataForSEO MCP for real SEO data. Model-agnostic — use it
            with Claude Code, GPT, or others.
          </p>
          <ul className="mt-4 space-y-2">
            {[
              "Keyword research & topic analysis",
              "Source discovery & verification",
              "Content drafting with QA",
            ].map((item) => (
              <li
                key={item}
                className="flex gap-2.5 text-sm text-base-content/70"
              >
                <span className="mt-[2px] shrink-0 text-base-content/40">
                  &mdash;
                </span>
                {item}
              </li>
            ))}
          </ul>
          <a
            href={SAM_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-base-content hover:text-base-content/60 transition-colors"
          >
            View on GitHub
            <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        {/* Use any coding agent */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Use any coding agent</h2>
          <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
            Pair your preferred agent with the DataForSEO MCP server to access
            keyword volumes, SERP results, backlink profiles, and more.
          </p>
          <p className="mt-3 text-sm text-base-content/60">
            Claude Code &middot; Cursor &middot; Windsurf &middot; Codex
            &middot; any MCP-compatible agent
          </p>
          <a
            href={DATAFORSEO_MCP_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-base-content hover:text-base-content/60 transition-colors"
          >
            DataForSEO MCP setup guide
            <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        {/* Roadmap */}
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
                title: "More MCP integrations",
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
