import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { getAuthMode } from "@/lib/auth-mode";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  agentUpdatePrompt,
  getAgentSetupPrompt,
} from "@/client/features/ai-mcp/agentSetupPrompt";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { AgentList } from "@/client/features/ai-mcp/AgentList";
import { brand } from "@/shared/brand";

const DOCS_URL = `${brand.docsUrl}/agent-setup`;
const COACH_DOCS_URL = `${brand.docsUrl}/skills/seo-coach`;
const SKILLS = [
  ["seo-coach", "Explains where you stand and picks your next step."],
  [
    "seo-project-setup",
    "Saves your goals, competitors, and key pages as shared context.",
  ],
  [
    "seo-audit",
    "One-page site audit built around a single do-this-week action.",
  ],
  ["keyword-research", "Finds keyword opportunities from a few seed topics."],
  ["keyword-clustering", "Groups keywords by intent and maps them to pages."],
  ["competitive-landscape", "Maps who wins in your market and why."],
  [
    "competitor-analysis",
    "Studies one competitor's keywords, content, and backlinks.",
  ],
  ["link-prospecting", "Finds link prospects and drafts outreach."],
  ["local-seo", "Audits a Google Business Profile and Maps visibility."],
  ["seo-report", "Saves any of the above as a report on your Reports page."],
];

export const Route = createFileRoute("/_app/ai")({
  component: AiPage,
});

function AiPage() {
  const origin =
    typeof window === "undefined" ? brand.appUrl : window.location.origin;
  const mcpUrl = `${origin}/mcp`;
  const prompt = getAgentSetupPrompt(origin);
  const [tab, setTab] = useState<"setup" | "skills">("setup");

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-12 md:px-6 md:py-16 pb-24 md:pb-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Agent setup</h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-base-content/70">
          The most powerful way to use {brand.name} is through the AI agent you
          already use. Set it up once, then ask it anything.
        </p>

        <div role="tablist" className="tabs tabs-border mt-8 w-fit">
          {(
            [
              ["setup", "Set up your agent"],
              ["skills", "Skills"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tab ${tab === id ? "tab-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "setup" ? (
          <>
            <div className="mt-6 space-y-5">
              <section className="rounded-xl border border-base-300 p-5 sm:p-6">
                <h2 className="text-base font-semibold">Set up your agent</h2>
                <p className="mt-2 text-sm leading-relaxed text-base-content/60">
                  Paste the setup prompt into your agent to connect {brand.name}{" "}
                  and install its SEO skills. It will guide you through any
                  manual steps.
                </p>
                <AgentList />
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 [&>button]:h-11 [&>button]:gap-2 [&>button]:text-sm">
                  <CopyButton
                    primary
                    value={prompt}
                    label="Copy setup prompt"
                    successMessage="Setup prompt copied"
                    onCopy={() => captureClientEvent("mcp:setup_prompt_copy")}
                  />
                  <a
                    href={`${DOCS_URL}#set-up-your-agent`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-base-content/60 underline decoration-base-content/25 underline-offset-4 hover:text-base-content"
                  >
                    Setup instructions
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
                <p className="mt-5 border-t border-base-300 pt-4 text-sm leading-relaxed text-base-content/60">
                  Once connected, ask your agent to use{" "}
                  <a
                    href={COACH_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-base-content underline decoration-base-content/25 underline-offset-4 hover:decoration-base-content"
                  >
                    SEO Coach
                  </a>{" "}
                  to help you choose what to do next.
                </p>
              </section>

              <section className="rounded-xl border border-base-300 p-5 sm:p-6">
                <h2 className="text-base font-semibold">Update your skills</h2>
                <p className="mt-2 text-sm leading-relaxed text-base-content/60">
                  Already connected? Paste the update prompt into your agent to
                  get the latest {brand.name} skills while preserving your
                  connection settings and personal edits.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 [&>button]:h-11 [&>button]:gap-2 [&>button]:text-sm">
                  <CopyButton
                    primary
                    value={agentUpdatePrompt}
                    label="Copy update prompt"
                    successMessage="Update prompt copied"
                    onCopy={() => captureClientEvent("mcp:update_prompt_copy")}
                  />
                  <a
                    href={`${DOCS_URL}#update-your-skills`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-base-content/60 underline decoration-base-content/25 underline-offset-4 hover:text-base-content"
                  >
                    Update instructions
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
              </section>
            </div>

            {getAuthMode(import.meta.env.AUTH_MODE) === "cloudflare_access" ? (
              <div className="alert alert-warning mt-8 text-sm" role="alert">
                <ShieldAlert className="size-4 shrink-0" />
                <span>
                  This instance is behind Cloudflare Access. MCP clients cannot
                  connect until Managed OAuth is enabled on your Access
                  application.{" "}
                  <a
                    href={`${brand.docsUrl}/self-hosting/cloudflare#connect-the-mcp-server-through-cloudflare-access`}
                    target="_blank"
                    rel="noreferrer"
                    className="link font-medium"
                  >
                    Setup guide
                  </a>
                </span>
              </div>
            ) : null}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-base-300 pt-5 text-xs text-base-content/55">
              <span>
                MCP server URL for this instance:{" "}
                <code className="font-mono text-base-content/80">{mcpUrl}</code>
              </span>
              <CopyButton
                value={mcpUrl}
                successMessage="MCP URL copied"
                onCopy={() => captureClientEvent("mcp:setup_url_copy")}
              />
            </div>
          </>
        ) : (
          <section className="mt-6">
            <p className="text-sm text-base-content/60">
              The setup prompt installs these. Run one by name when you want a
              full report instead of a quick answer.
            </p>
            <ul className="mt-5 space-y-3 text-sm sm:space-y-2">
              {SKILLS.map(([name, blurb]) => (
                <li
                  key={name}
                  className="flex flex-col gap-0.5 sm:flex-row sm:gap-3"
                >
                  <a
                    href={`${brand.docsUrl}/skills/${name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-mono text-[13px] text-base-content underline decoration-base-content/25 underline-offset-4 hover:decoration-base-content sm:w-48"
                  >
                    /{name}
                  </a>
                  <span className="text-base-content/60">{blurb}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
