import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { captureClientEvent } from "@/client/lib/posthog";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { dismissDashboardMcpCard } from "@/serverFunctions/dashboard";

function firstPrompts(domain: string | null): string[] {
  const site = domain ?? "我的网站";
  return [
    `使用 OpenSEO 分析 ${site}，并建议可以重点布局哪些关键词`,
    "使用 OpenSEO 研究竞争对手的热门页面和关键词，并告诉我哪些策略有效",
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
          连接您的 AI 智能体
        </h2>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="badge badge-success badge-outline badge-sm">
              已连接
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
            我已完成连接
          </button>
        </div>
      </div>
      <div className="space-y-3 border-t border-base-300 p-5">
        {connected ? (
          <>
            <p className="text-sm text-base-content/70">
              智能体已连接，可以试着这样提问：
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
                    successMessage="提示词已复制"
                    iconOnly
                    onCopy={() =>
                      captureClientEvent("dashboard:mcp_prompt_copy")
                    }
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-base-content/50">
              正在等待首次调用。智能体连接 OpenSEO 后，此卡片会自动消失。
            </p>
          </>
        ) : (
          <>
            <div className="space-y-2 text-sm text-base-content/70">
              <p>OpenSEO 为 AI 智能体提供制定和执行 SEO 策略所需的数据。</p>
              <p>这种方式不受“AI 点数”限制。</p>
              <p>
                您可以与智能体共同设计合适的自动化流程，也可以让它协助撰写内容。
              </p>
            </div>
            <Link
              to="/ai"
              className="link link-primary text-sm font-medium"
              onClick={() => captureClientEvent("dashboard:mcp_setup_open")}
            >
              前往 AI 与 MCP 设置 →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
