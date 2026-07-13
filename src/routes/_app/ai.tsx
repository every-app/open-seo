import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { captureClientEvent } from "@/client/lib/posthog";
import { ClaudeIcon, CodexIcon } from "@/client/features/ai-mcp/AgentIcons";
import { AvailableTools } from "@/client/features/ai-mcp/AvailableTools";
import {
  CodeBlock,
  Collapsible,
  CopyButton,
} from "@/client/features/ai-mcp/SetupControls";

const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";
const SUPPORT_EMAIL = "ben@openseo.so";
const SAM_GITHUB_URL = "https://github.com/every-app/sam";
const SKILL_NAMES = [
  "seo-project-setup",
  "seo-coach",
  "keyword-research",
  "keyword-clustering",
  "competitive-landscape",
  "competitor-analysis",
  "link-prospecting",
];
const SKILLS_INSTALL = `npx skills add every-app/open-seo`;
const ALL_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*'`;
const CLAUDE_CODE_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*' --agent claude-code`;
const CODEX_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*' --agent codex`;
const SKILLS_MANUAL_INSTALL = `git clone https://github.com/every-app/open-seo.git

# Codex
mkdir -p ~/.codex/skills
cp -R open-seo/.agents/skills/* ~/.codex/skills/

# Claude Code
mkdir -p ~/.claude/skills
cp -R open-seo/.agents/skills/* ~/.claude/skills/`;

export const Route = createFileRoute("/_app/ai")({
  component: AiPage,
});

function AiPage() {
  const mcpUrl =
    typeof window === "undefined"
      ? "https://app.openseo.so/mcp"
      : `${window.location.origin}/mcp`;

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-12 md:px-6 md:py-16 pb-24 md:pb-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">AI & MCP</h1>
        <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
          Connect your AI agent to OpenSEO. Run keyword research, SERP analysis,
          domain lookups, and backlink reviews from your editor or chat.
        </p>

        <section className="mt-8">
          <div className="rounded-lg border border-base-300 bg-base-200 px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                MCP server URL
              </p>
              <CopyButton
                value={mcpUrl}
                successMessage="MCP URL copied"
                onCopy={() => captureClientEvent("mcp:setup_url_copy")}
              />
            </div>
            <code className="mt-2 block break-all font-mono text-sm text-base-content">
              {mcpUrl}
            </code>
          </div>
          <p className="mt-2.5 text-xs text-base-content/55 leading-relaxed">
            Paste this into any MCP client. This URL points at the OpenSEO
            instance you are using now, whether hosted, self-hosted, or local.
            Sign in with OpenSEO when prompted.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-base font-semibold">Setup guides</h2>
          <p className="mt-1.5 text-sm text-base-content/70">
            Pick your agent.
          </p>
          <div className="mt-4 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <Collapsible
              id="claude-code"
              title="Claude Code"
              subtitle="Add with the CLI"
              icon={<ClaudeIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">
                Run this in your terminal:
              </p>
              <CodeBlock
                code={`claude mcp add --transport http --scope user openseo ${mcpUrl}`}
                onCopy={() =>
                  captureClientEvent("mcp:setup_command_copy", {
                    agent: "claude-code",
                  })
                }
              />
              <p className="text-sm text-base-content/70">
                Approve the login when prompted.
              </p>
            </Collapsible>

            <Collapsible
              id="claude-desktop"
              title="Claude Desktop"
              subtitle="Add a custom connector"
              icon={<ClaudeIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  Open <span className="text-base-content">Settings</span> →{" "}
                  <span className="text-base-content">Connectors</span>.
                </li>
                <li>
                  Click{" "}
                  <span className="font-medium text-base-content">
                    Add custom connector
                  </span>
                  .
                </li>
                <li>Paste the MCP URL above and click Add.</li>
                <li>Approve the OpenSEO login when prompted.</li>
                <li>
                  Optional: after OpenSEO connects, click{" "}
                  <span className="font-medium text-base-content">
                    Configure
                  </span>
                  , then choose{" "}
                  <span className="font-medium text-base-content">
                    Always Approved
                  </span>
                  , except for any tools you want Claude to ask before using.
                </li>
              </ol>
              <p className="text-xs text-base-content/55 leading-relaxed">
                Requires a Claude Pro, Max, Team, or Enterprise plan.
              </p>
            </Collapsible>

            <Collapsible
              id="codex"
              title="Codex"
              subtitle="Add with the CLI"
              icon={<CodexIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">
                Run this in your terminal:
              </p>
              <CodeBlock
                code={`codex mcp add openseo --url ${mcpUrl}`}
                onCopy={() =>
                  captureClientEvent("mcp:setup_command_copy", {
                    agent: "codex",
                  })
                }
              />
              <p className="text-sm text-base-content/70">
                Approve the login when prompted.
              </p>
            </Collapsible>

            <Collapsible
              id="codex-desktop"
              title="Codex Desktop"
              subtitle="Settings → Integrations & MCP"
              icon={<CodexIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  Open{" "}
                  <span className="text-base-content">
                    Settings → Integrations & MCP
                  </span>
                  .
                </li>
                <li>
                  Click{" "}
                  <span className="font-medium text-base-content">
                    Add your own
                  </span>
                  .
                </li>
                <li>Paste the MCP URL above.</li>
                <li>Approve the OpenSEO login when prompted.</li>
              </ol>
            </Collapsible>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">OpenSEO Skills</h2>
          <p className="mt-1.5 text-sm text-base-content/70 leading-relaxed">
            Skills give Codex and Claude Code reusable SEO workflows that can
            call your OpenSEO MCP tools when live SERP, keyword, backlink, or
            domain data is needed.
          </p>
          <div className="mt-4 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <Collapsible
              id="skills-add"
              title="Install with skills add"
              subtitle="Recommended cross-agent installer"
            >
              <CodeBlock code={SKILLS_INSTALL} />
              <p className="text-sm text-base-content/70">
                You can also auto-accept each OpenSEO skill:
              </p>
              <CodeBlock code={ALL_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="claude-code-skills"
              title="Install for Claude Code"
              subtitle="Target Claude Code only"
              icon={<ClaudeIcon className="size-5" />}
            >
              <CodeBlock code={CLAUDE_CODE_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="codex-skills"
              title="Install for Codex"
              subtitle="Target OpenAI Codex only"
              icon={<CodexIcon className="size-5" />}
            >
              <CodeBlock code={CODEX_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="manual-skills"
              title="Manual GitHub install"
              subtitle="Clone the repo and copy the skills"
            >
              <CodeBlock code={SKILLS_MANUAL_INSTALL} />
            </Collapsible>
          </div>
          <div className="mt-5">
            <p className="text-sm text-base-content/70 leading-relaxed">
              Start with{" "}
              <span className="font-mono text-base-content">
                /seo-project-setup
              </span>
              . It will ask about your project and help configure your
              workspace.
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-base-content/50">
              Available skills
            </p>
            <ul className="mt-2 grid gap-1.5 text-sm text-base-content/70 sm:grid-cols-2">
              {SKILL_NAMES.map((skill) => (
                <li key={skill} className="flex gap-2">
                  <span className="text-base-content/35">-</span>
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Available tools</h2>
          <div className="mt-5">
            <AvailableTools />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Sam: AI SEO teammate</h2>
          <p className="mt-1.5 text-sm text-base-content/70 leading-relaxed">
            Sam is an experimental content workflow for Claude Code and other
            coding agents. It combines keyword research, source discovery,
            drafting, and QA.
          </p>
          <a
            href={SAM_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-base-content transition-colors hover:text-base-content/60"
          >
            View Sam on GitHub
            <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Roadmap</h2>
          <ul className="mt-4 space-y-3">
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
            ].map((item) => (
              <li key={item.title} className="flex gap-2.5 text-sm">
                <span className="mt-[2px] shrink-0 text-base-content/40">
                  &mdash;
                </span>
                <span className="text-base-content/70">
                  <span className="font-medium text-base-content">
                    {item.title}
                  </span>
                  <br />
                  {item.description}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-xs text-base-content/55 leading-relaxed">
          Have feedback? Reach out on{" "}
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
      </div>
    </div>
  );
}
