import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, ShieldAlert } from "@/client/components/icons";
import { getAuthMode } from "@/lib/auth-mode";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  agentUpdatePrompt,
  getAgentSetupPrompt,
} from "@/client/features/ai-mcp/agentSetupPrompt";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { AgentList } from "@/client/features/ai-mcp/AgentList";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Card } from "@/client/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";

const DOCS_URL = "https://openseo.so/docs/agent-setup";
const COACH_DOCS_URL = "https://openseo.so/docs/skills/seo-coach";
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
    typeof window === "undefined"
      ? "https://app.openseo.so"
      : window.location.origin;
  const mcpUrl = `${origin}/mcp`;
  const prompt = getAgentSetupPrompt(origin);
  const [tab, setTab] = useState<"setup" | "skills">("setup");

  return (
    <div className="h-full overflow-auto px-4 py-12 pb-24 md:px-6 md:py-16 md:pb-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Agent setup</h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          The most powerful way to use OpenSEO is through the AI agent you
          already use. Set it up once, then ask it anything.
        </p>

        <Tabs
          value={tab}
          onValueChange={(value: "setup" | "skills") => setTab(value)}
          className="mt-8"
        >
          <TabsList>
            <TabsTrigger value="setup">Set up your agent</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="mt-0">
            <div className="mt-6 space-y-5">
              <Card className="p-5 sm:p-6">
                <h2 className="text-base font-semibold">Set up your agent</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Paste the setup prompt into your agent to connect OpenSEO and
                  install its SEO skills. It will guide you through any manual
                  steps.
                </p>
                <AgentList />
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <CopyButton
                    primary
                    value={prompt}
                    label="Copy setup prompt"
                    successMessage="Setup prompt copied"
                    onCopy={() => captureClientEvent("mcp:setup_prompt_copy")}
                    className="h-11 gap-2"
                  />
                  <a
                    href={`${DOCS_URL}#set-up-your-agent`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground underline decoration-muted-foreground/70 underline-offset-4 hover:text-foreground"
                  >
                    Setup instructions
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
                <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                  Once connected, ask your agent to use{" "}
                  <a
                    href={COACH_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline decoration-muted-foreground/70 underline-offset-4 hover:decoration-foreground"
                  >
                    SEO Coach
                  </a>{" "}
                  to help you choose what to do next.
                </p>
              </Card>

              <Card className="p-5 sm:p-6">
                <h2 className="text-base font-semibold">Update your skills</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Already connected? Paste the update prompt into your agent to
                  get the latest OpenSEO skills while preserving your connection
                  settings and personal edits.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <CopyButton
                    primary
                    value={agentUpdatePrompt}
                    label="Copy update prompt"
                    successMessage="Update prompt copied"
                    onCopy={() => captureClientEvent("mcp:update_prompt_copy")}
                    className="h-11 gap-2"
                  />
                  <a
                    href={`${DOCS_URL}#update-your-skills`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground underline decoration-muted-foreground/70 underline-offset-4 hover:text-foreground"
                  >
                    Update instructions
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
              </Card>
            </div>

            {getAuthMode(import.meta.env.AUTH_MODE) === "cloudflare_access" ? (
              <Alert
                className="border-warning/40 [&>svg]:text-warning mt-8 text-sm"
                role="alert"
              >
                <ShieldAlert className="size-4 shrink-0" />
                <AlertDescription>
                  This instance is behind Cloudflare Access. MCP clients cannot
                  connect until Managed OAuth is enabled on your Access
                  application.{" "}
                  <a
                    href="https://openseo.so/docs/self-hosting/cloudflare#connect-the-mcp-server-through-cloudflare-access"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4 font-medium"
                  >
                    Setup guide
                  </a>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
              <span>
                MCP server URL for this instance:{" "}
                <code className="font-mono text-foreground">{mcpUrl}</code>
              </span>
              <CopyButton
                value={mcpUrl}
                successMessage="MCP URL copied"
                onCopy={() => captureClientEvent("mcp:setup_url_copy")}
              />
            </div>
          </TabsContent>

          <TabsContent value="skills" className="mt-6">
            <p className="text-sm text-muted-foreground">
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
                    href={`https://openseo.so/docs/skills/${name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-mono text-[13px] text-foreground underline decoration-muted-foreground/70 underline-offset-4 hover:decoration-foreground sm:w-48"
                  >
                    /{name}
                  </a>
                  <span className="text-muted-foreground">{blurb}</span>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
