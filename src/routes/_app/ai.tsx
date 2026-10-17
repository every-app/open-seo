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
import { useLocale } from "@/client/lib/i18n";

const DOCS_URL = "https://openseo.so/docs/agent-setup";
const COACH_DOCS_URL = "https://openseo.so/docs/skills/seo-coach";
const LINK_CLASS =
  "text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground";
const MUTED_LINK_CLASS =
  "inline-flex items-center gap-1 text-sm text-muted-foreground underline decoration-foreground/25 underline-offset-4 hover:text-foreground";
const SKILL_NAMES = [
  "seo-coach",
  "seo-project-setup",
  "seo-audit",
  "ai-visibility-audit",
  "ai-prompt-research",
  "keyword-research",
  "keyword-clustering",
  "competitive-landscape",
  "competitor-analysis",
  "link-prospecting",
  "local-seo",
  "seo-report",
] as const;

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
  const { t } = useLocale();
  const origin = window.location.origin;
  const mcpUrl = `${origin}/mcp`;
  const prompt = getAgentSetupPrompt(origin);

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title={t("ai.title")}
          description={t("ai.description")}
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
            <TabsTrigger value="setup">{t("ai.tabs.setup")}</TabsTrigger>
            <TabsTrigger value="skills">{t("ai.tabs.skills")}</TabsTrigger>
          </TabsList>
          <TabsContent value="setup">
            <div className="mt-6 space-y-5">
              <Card size="lg">
                <CardHeader>
                  <CardTitle>
                    <h2>{t("ai.setup.title")}</h2>
                  </CardTitle>
                  <CardDescription>
                    {t("ai.setup.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AgentList />
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                    <CopyButton
                      variant="default"
                      size="lg"
                      value={prompt}
                      label={t("ai.setup.copy_button")}
                      successMessage={t("ai.setup.copy_success")}
                      onCopy={() => captureClientEvent("mcp:setup_prompt_copy")}
                    />
                    <a
                      href={`${DOCS_URL}#set-up-your-agent`}
                      target="_blank"
                      rel="noreferrer"
                      className={MUTED_LINK_CLASS}
                    >
                      {t("ai.setup.instructions")}
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  </div>
                </CardContent>
                <CardFooter className="text-muted-foreground">
                  <p>
                    {t("ai.setup.coach_hint_prefix")}
                    <a
                      href={COACH_DOCS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className={LINK_CLASS}
                    >
                      {t("ai.setup.coach_hint_link")}
                    </a>
                    {t("ai.setup.coach_hint_suffix")}
                  </p>
                </CardFooter>
              </Card>

              <Card size="lg">
                <CardHeader>
                  <CardTitle>
                    <h2>{t("ai.update.title")}</h2>
                  </CardTitle>
                  <CardDescription>
                    {t("ai.update.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <CopyButton
                    variant="default"
                    size="lg"
                    value={agentUpdatePrompt}
                    label={t("ai.update.copy_button")}
                    successMessage={t("ai.update.copy_success")}
                    onCopy={() => captureClientEvent("mcp:update_prompt_copy")}
                  />
                  <a
                    href={`${DOCS_URL}#update-your-skills`}
                    target="_blank"
                    rel="noreferrer"
                    className={MUTED_LINK_CLASS}
                  >
                    {t("ai.update.instructions")}
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </CardContent>
              </Card>
            </div>

            {getAuthMode(import.meta.env.AUTH_MODE) === "cloudflare_access" ? (
              <Alert variant="warning" className="mt-8">
                <ShieldAlert />
                <AlertDescription>
                  {t("ai.cloudflare_alert")}{" "}
                  <a
                    href="https://openseo.so/docs/self-hosting/cloudflare#connect-the-mcp-server-through-cloudflare-access"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium"
                  >
                    {t("ai.cloudflare_guide")}
                  </a>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
              <span>
                {t("ai.mcp_url_label")}{" "}
                <code className="font-mono text-foreground/80">{mcpUrl}</code>
              </span>
              <CopyButton
                value={mcpUrl}
                successMessage={t("ai.mcp_url_copied")}
                onCopy={() => captureClientEvent("mcp:setup_url_copy")}
              />
            </div>
          </TabsContent>
          <TabsContent value="skills">
            <section className="mt-6">
              <p className="text-sm text-muted-foreground">
                {t("ai.skills.intro")}
              </p>
              <ul className="mt-5 space-y-3 text-sm sm:space-y-2">
                {SKILL_NAMES.map((name) => (
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
                    <span className="text-muted-foreground">
                      {t(`ai.skills.${name}`)}
                    </span>
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
