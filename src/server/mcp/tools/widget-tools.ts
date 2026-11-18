import { z } from "zod";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { displayWidgetResult } from "@/server/mcp/widget-results";
import { MCP_WIDGET_URI, WidgetTool } from "@/shared/mcp-contracts";

const inputSchema = {
  projectId: projectIdSchema,
  resultId: z
    .uuid()
    .describe(
      "The resultId returned by the corresponding get_ tool for this project. Reuses its exact data and query arguments without another fetch. Valid for one hour and only for the same user and project.",
    ),
};

const outputSchema = z.looseObject({
  displayed: z.literal(true),
  resultId: z.string(),
  ...optionalMetaOutputSchema,
});

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const showSearchConsolePerformanceTool = {
  name: "show_search_console_performance",
  config: {
    title: "Show Search Console performance",
    description:
      "Show Search Console performance as an interactive table, or a prompt to connect Google. Pass the resultId returned by get_search_console_performance; the widget receives the exact saved data and query arguments, so do not copy rows into this call. Use it when the user would benefit from inspecting, filtering, or selecting results, or needs to connect Google; intermediate research and prose-only answers do not need a widget. It fetches no data, does not connect Google itself, and uses no credits.",
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: { ui: { resourceUri: MCP_WIDGET_URI } },
  },
  handler: withMcpProjectAuth((args: Args, context) =>
    displayWidgetResult(WidgetTool.SearchConsole, args, context.auth),
  ),
};

export const showSerpResultsTool = {
  name: "show_serp_results",
  config: {
    title: "Show Google SERP results",
    description:
      "Show Google search results as an interactive widget where the user can filter, select pages, and compare them with their assistant. Pass the resultId returned by get_serp_results; the widget receives the exact saved results, so do not copy rows into this call. Use it only when that interaction helps: ordinary research and prose-only answers do not need a widget. It fetches nothing and uses no credits.",
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: { ui: { resourceUri: MCP_WIDGET_URI } },
  },
  handler: withMcpProjectAuth((args: Args, context) =>
    displayWidgetResult(WidgetTool.Serp, args, context.auth),
  ),
};
