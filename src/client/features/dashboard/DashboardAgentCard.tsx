import type { ComponentType, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Bot, X } from "lucide-react";
import { CopyButton } from "@/client/components/CopyButton";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { ONE_CLICK_INSTALLS } from "@/client/features/ai-mcp/agentInstalls";
import { captureClientEvent } from "@/client/lib/posthog";
import { dismissDashboardAgentCard } from "@/serverFunctions/dashboard";
import { listMcpConnections } from "@/serverFunctions/mcp-connections";

const actionClassName = "h-9 px-3 text-xs sm:text-sm";

// For people who haven't connected an agent.
export function DashboardAgentCard({ projectId }: { projectId: string }) {
  return (
    <AgentCard
      projectId={projectId}
      icons={ONE_CLICK_INSTALLS.map(({ Icon }) => Icon)}
      title="Use OpenSEO in ChatGPT or Claude"
      description="Research keywords and audit your site from the chatbot you already use."
    >
      {ONE_CLICK_INSTALLS.map(({ agent, name, href, Icon }) => (
        <Button
          key={agent}
          variant="outline"
          className={actionClassName}
          nativeButton={false}
          render={<a href={href} target="_blank" rel="noreferrer" />}
          onClick={() =>
            captureClientEvent("onboarding:add_to_agent_click", {
              agent,
              source: "dashboard",
            })
          }
        >
          <Icon data-icon="inline-start" />
          Add to {name}
        </Button>
      ))}
    </AgentCard>
  );
}

// For people whose agent is connected but hasn't used OpenSEO yet: opens a new
// chat in the app they connected, with a first prompt filled in.
export function DashboardAgentPromptCard({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string | null;
}) {
  const connections = useQuery({
    queryKey: ["mcpConnections"],
    queryFn: () => listMcpConnections(),
  });
  if (!connections.data) return null;

  // An API key or a teammate's agent leaves this person with no connections
  // of their own, so offer both chat apps.
  const grants = connections.data;
  const chats = ONE_CLICK_INSTALLS.filter(
    ({ agent }) =>
      grants.length === 0 || grants.some((grant) => grant.webChat === agent),
  );
  const prompt = `Use OpenSEO to audit ${domain ?? "my website"} and tell me the 3 most important next steps.`;

  return (
    <AgentCard
      projectId={projectId}
      icons={chats.length > 0 ? chats.map(({ Icon }) => Icon) : [Bot]}
      title={`Ask ${chats.length === 1 ? chats[0].name : "your agent"} about your site`}
      description={`Try: “${prompt}”`}
    >
      {chats.map(({ agent, name, newChatUrl, Icon }) => (
        <Button
          key={agent}
          variant="outline"
          className={actionClassName}
          nativeButton={false}
          render={
            <a href={newChatUrl(prompt)} target="_blank" rel="noreferrer" />
          }
          onClick={() =>
            captureClientEvent("dashboard:open_in_agent_click", { agent })
          }
        >
          <Icon data-icon="inline-start" />
          Open in {name}
        </Button>
      ))}
      <CopyButton
        value={prompt}
        successMessage="Prompt copied"
        label="Copy prompt"
        size="default"
        className={actionClassName}
        onCopy={() => captureClientEvent("dashboard:agent_prompt_copy")}
      />
    </AgentCard>
  );
}

function AgentCard({
  projectId,
  icons,
  title,
  description,
  children,
}: {
  projectId: string;
  icons: ComponentType<{ className?: string }>[];
  title: string;
  description: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => dismissDashboardAgentCard({ data: { projectId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      });
      captureClientEvent("dashboard:agent_card_dismiss");
    },
  });

  return (
    <Card
      role="region"
      aria-label={title}
      className="relative flex-row flex-wrap items-center gap-x-6 gap-y-4 p-5 pr-9 shadow-none"
    >
      <div className="flex min-w-0 flex-1 basis-[32rem] items-center gap-4">
        <div className="flex shrink-0 items-center" aria-hidden>
          {icons.map((Icon, index) => (
            <span
              key={index}
              className={cn(
                "flex size-10 items-center justify-center rounded-lg border border-border",
                index === 0 ? "bg-card" : "-ml-2 mt-3 bg-muted",
              )}
            >
              <Icon className="size-5" />
            </span>
          ))}
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-pretty text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute right-1 top-1 text-muted-foreground"
        aria-label="Dismiss chatbot card"
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate()}
      >
        <X />
      </Button>
    </Card>
  );
}
