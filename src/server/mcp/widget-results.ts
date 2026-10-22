import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DashboardCacheService } from "@/server/features/dashboard/services/DashboardCacheService";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { ToolAuthContext } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { widgetSnapshotSchema, WidgetTool } from "@/shared/mcp-contracts";

const RESULT_TTL_SECONDS = 60 * 60;
type ResultAuth = Pick<ToolAuthContext, "organizationId" | "userId">;
const SHOW_TOOL: Record<WidgetTool, string> = {
  [WidgetTool.SearchConsole]: "show_search_console_performance",
  [WidgetTool.Serp]: "show_serp_results",
};

function resultKey(
  tool: WidgetTool,
  projectId: string,
  resultId: string,
  auth: ResultAuth,
) {
  // Google disconnect, project deletion, and account erasure already remove
  // every GSC cache under this project's namespace, including these snapshots.
  const namespace =
    tool === WidgetTool.SearchConsole
      ? DashboardCacheService.gscNamespace(projectId, "mcp-widget")
      : "mcp:serp-results";
  return buildCacheKey(namespace, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    projectId,
    resultId,
  });
}

export async function rememberWidgetResult(
  tool: WidgetTool,
  args: unknown,
  result: CallToolResult,
  auth: ResultAuth,
): Promise<CallToolResult> {
  if (result.isError || !result.structuredContent) return result;
  const input = z.object({ projectId: z.string() }).passthrough().parse(args);
  const resultId = crypto.randomUUID();
  const data = { ...result.structuredContent, resultId };
  const snapshot = {
    context: { tool, arguments: input },
    data,
    text: result.content
      .flatMap((item) => (item.type === "text" ? [item.text] : []))
      .join("\n"),
  };
  try {
    const key = await resultKey(tool, input.projectId, resultId, auth);
    await setCached(key, snapshot, RESULT_TTL_SECONDS);
  } catch (error) {
    // A display-cache outage must not discard research the caller already
    // paid for. Return that data without advertising an unusable resultId.
    console.error("mcp.widget-result.cache-write failed:", error);
    return result;
  }
  // Some hosts give the model only text content, so it needs the id there too.
  return {
    ...result,
    content: [
      ...result.content,
      {
        type: "text",
        text: `resultId: ${resultId} (optional: pass it to ${SHOW_TOOL[tool]} for an interactive view; valid for one hour)`,
      },
    ],
    structuredContent: data,
  };
}

export async function displayWidgetResult(
  tool: WidgetTool,
  args: { projectId: string; resultId: string },
  auth: ResultAuth,
): Promise<CallToolResult> {
  const key = await resultKey(tool, args.projectId, args.resultId, auth);
  const snapshot = widgetSnapshotSchema.safeParse(await getCached(key));
  if (!snapshot.success) {
    throw new AppError(
      "NOT_FOUND",
      `This saved result is unavailable or expired. Run ${tool} for this project again, then show its new resultId. Displaying results never runs research automatically.`,
    );
  }
  const result = mcpResponse({
    text: "Showing the saved OpenSEO results.",
    meta: { projectId: args.projectId },
    structuredContent: { displayed: true, resultId: args.resultId },
  });
  return {
    ...result,
    _meta: { ...result._meta, openSeoWidget: snapshot.data },
  };
}
