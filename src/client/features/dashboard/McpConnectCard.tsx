import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { captureClientEvent } from "@/client/lib/posthog";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { dismissDashboardMcpCard } from "@/serverFunctions/dashboard";

function firstPrompts(domain: string | null): string[] {
  const site = domain ?? "my site";
  return [
    `Review ${site}. Ideas for what keywords we could target? Use OpenSEO`,
    "Research my competitors top pages and keywords and tell me what's working. Use OpenSEO",
  ];
}

/**
 * The MCP activation card. Pitches the agent workflow and links to the
 * AI & MCP page for setup; disappears for good after the org's first
 * external tool call (or an explicit "I already connected").
 */
export function McpConnectCard({
  projectId,
  activation,
}: {
  projectId: string;
  activation: DashboardActivation;
}) {
  const queryClient = useQueryClient();
  const dismissMutation = useMutation({
    mutationFn: () => dismissDashboardMcpCard({ data: { projectId } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      }),
  });

  if (activation.mcp.firstToolCallAt || activation.mcp.cardDismissedAt) {
    return null;
  }

  const connected = activation.mcp.authorizedAt !== null;

  return (
    <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <h2 className="text-base font-semibold leading-tight">
          Connect your AI agent
        </h2>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="badge badge-success badge-outline badge-sm">
              Connected
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-xs text-base-content/60"
            disabled={dismissMutation.isPending}
            onClick={() => {
              captureClientEvent("dashboard:mcp_already_connected");
              dismissMutation.mutate();
            }}
          >
            I already connected
          </button>
        </div>
      </div>
      <div className="space-y-3 border-t border-base-300 p-5">
        {connected ? (
          <>
            <p className="text-sm text-base-content/70">
              Your agent is connected. Try asking it:
            </p>
            <ul className="space-y-2">
              {firstPrompts(activation.domain).map((prompt) => (
                <li
                  key={prompt}
                  className="flex items-center justify-between gap-2 rounded-md border border-base-300 bg-base-200/50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-xs text-base-content/80">
                    {prompt}
                  </span>
                  <CopyButton
                    value={prompt}
                    successMessage="Prompt copied"
                    iconOnly
                    onCopy={() =>
                      captureClientEvent("dashboard:mcp_prompt_copy")
                    }
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-base-content/50">
              Waiting for your first call — this card disappears once your agent
              talks to OpenSEO.
            </p>
          </>
        ) : (
          <>
            <div className="space-y-2 text-sm text-base-content/70">
              <p>
                OpenSEO is designed to give your AI agent the data it needs to
                build a great SEO strategy and help you execute it.
              </p>
              <p>
                This way you aren&rsquo;t limited on &ldquo;AI credits&rdquo;.
              </p>
              <p>
                You can work with your agent to figure out what automations make
                sense for you and it can help you write content too.
              </p>
            </div>
            <Link
              to="/ai"
              className="link link-primary text-sm font-medium"
              onClick={() => captureClientEvent("dashboard:mcp_setup_open")}
            >
              Set up in AI &amp; MCP →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
