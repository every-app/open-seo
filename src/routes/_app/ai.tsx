import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { PageHeader } from "@/client/components/PageHeader";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { getAuthMode } from "@/lib/auth-mode";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  agentUpdatePrompt,
  getAgentSetupPrompt,
} from "@/client/features/ai-mcp/agentSetupPrompt";
import { CopyButton } from "@/client/components/CopyButton";
import { AgentList } from "@/client/features/ai-mcp/AgentList";

const DOCS_URL = "https://openseo.so/docs/agent-setup";
const COACH_DOCS_URL = "https://openseo.so/docs/skills/seo-coach";
const LINK_CLASS =
  "text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground";
const MUTED_LINK_CLASS =
  "inline-flex items-center gap-1 text-sm text-muted-foreground underline decoration-foreground/25 underline-offset-4 hover:text-foreground";
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
  [
    "ai-visibility-audit",
    "Finds the few changes most likely to get you cited in AI answers.",
  ],
  [
    "ai-prompt-research",
    "Finds what people ask ChatGPT about your market and who gets cited.",
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

const aiSearchSchema = z.object({
  // Active tab. Omitted for the default "setup" tab.
  tab: z.enum(["skills"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/ai")({
  validateSearch: aiSearchSchema,
  component: AiPage,
});

function AiPage() {
  const { tab = "setup" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const origin = window.location.origin;
  const mcpUrl = `${origin}/mcp`;
  const prompt = getAgentSetupPrompt(origin);

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Agent setup"
          description="The most powerful way to use OpenSEO is through the AI agent you already use. Set it up once, then ask it anything."
        />

        <Tabs
          value={tab}
          onValueChange={(value) =>
            void navigate({
              search: { tab: value === "skills" ? "skills" : undefined },
              replace: true,
            })
          }
          className="mt-8"
        >
          <TabsList variant="line">
            <TabsTrigger value="setup">Set up your agent</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>
          <TabsContent value="setup">
            <div className="mt-6 space-y-5">
              <Card size="lg">
                <CardHeader>
                  <CardTitle>
                    <h2>Set up your agent</h2>
                  </CardTitle>
                  <CardDescription>
                    Paste the setup prompt into your agent to connect OpenSEO
                    and install its SEO skills. It will guide you through any
                    manual steps.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AgentList />
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                    <CopyButton
                      variant="default"
                      size="lg"
                      value={prompt}
                      label="Copy setup prompt"
                      successMessage="Setup prompt copied"
                      onCopy={() => captureClientEvent("mcp:setup_prompt_copy")}
                    />
                    <a
                      href={`${DOCS_URL}#set-up-your-agent`}
                      target="_blank"
                      rel="noreferrer"
                      className={MUTED_LINK_CLASS}
                    >
                      Setup instructions
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  </div>
                </CardContent>
                <CardFooter className="text-muted-foreground">
                  <p>
                    Once connected, ask your agent to use{" "}
                    <a
                      href={COACH_DOCS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className={LINK_CLASS}
                    >
                      SEO Coach
                    </a>{" "}
                    to help you choose what to do next.
                  </p>
                </CardFooter>
              </Card>

              <Card size="lg">
                <CardHeader>
                  <CardTitle>
                    <h2>Update your skills</h2>
                  </CardTitle>
                  <CardDescription>
                    Already connected? Paste the update prompt into your agent
                    to get the latest OpenSEO skills while preserving your
                    connection settings and personal edits.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <CopyButton
                    variant="default"
                    size="lg"
                    value={agentUpdatePrompt}
                    label="Copy update prompt"
                    successMessage="Update prompt copied"
                    onCopy={() => captureClientEvent("mcp:update_prompt_copy")}
                  />
                  <a
                    href={`${DOCS_URL}#update-your-skills`}
                    target="_blank"
                    rel="noreferrer"
                    className={MUTED_LINK_CLASS}
                  >
                    Update instructions
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </CardContent>
              </Card>
            </div>

            {getAuthMode(import.meta.env.AUTH_MODE) === "cloudflare_access" ? (
              <Alert variant="warning" className="mt-8">
                <ShieldAlert />
                <AlertDescription>
                  This instance is behind Cloudflare Access. MCP clients cannot
                  connect until Managed OAuth is enabled on your Access
                  application.{" "}
                  <a
                    href="https://openseo.so/docs/self-hosting/cloudflare#connect-the-mcp-server-through-cloudflare-access"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium"
                  >
                    Setup guide
                  </a>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
              <span>
                MCP server URL for this instance:{" "}
                <code className="font-mono text-foreground/80">{mcpUrl}</code>
              </span>
              <CopyButton
                value={mcpUrl}
                successMessage="MCP URL copied"
                onCopy={() => captureClientEvent("mcp:setup_url_copy")}
              />
            </div>
          </TabsContent>
          <TabsContent value="skills">
            <section className="mt-6">
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
                      className={`shrink-0 font-mono text-[13px] sm:w-48 ${LINK_CLASS}`}
                    >
                      /{name}
                    </a>
                    <span className="text-muted-foreground">{blurb}</span>
                  </li>
                ))}
              </ul>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
