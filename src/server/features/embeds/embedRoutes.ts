import { env } from "cloudflare:workers";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { EmbedService } from "@/server/features/embeds/EmbedService";
import { asAppError } from "@/server/lib/errors";
import { objectSchema } from "@/server/mcp/output-schemas";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { getSearchConsolePerformanceTool } from "@/server/mcp/tools/search-console-tools";
import { toolErrorMessage } from "@/server/mcp/tool-error-message";
import {
  EMBED_PAGE_ELEMENT_ID,
  type EmbedPage,
  type EmbedWidget,
} from "@/shared/embeds";
import {
  widgetContextSchema,
  widgetSnapshotSchema,
  WidgetTool,
  type WidgetSnapshot,
} from "@/shared/mcp-contracts";

// The two public halves of an embed link, both authorized by the token alone:
// the page (the widget bundle MCP clients get, plus which widgets to draw) and
// the data endpoint the page calls, which runs the same MCP tools as the
// link's creator, for the link's project only.

const DEAD_LINK_BODY = "This OpenSEO embed link isn't active.";

/**
 * Framable by any site: the page and its data are read-only, so there is no
 * action to trick a viewer into, and agencies frame it from their own
 * white-label domains. The bundle is the one script, allowed by nonce.
 */
const embedCsp = (nonce: string) =>
  [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-ancestors *",
  ].join("; ");

const PUBLIC_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function deadLink() {
  return new Response(DEAD_LINK_BODY, {
    status: 404,
    headers: {
      ...PUBLIC_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      // Shown inside the dashboard that frames it, not as a refused frame.
      "Content-Security-Policy": "default-src 'none'; frame-ancestors *",
    },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: PUBLIC_HEADERS });
}

export async function renderEmbedPage(
  token: string,
  widgets: EmbedWidget[],
  request: Request,
) {
  if (
    widgets.length === 0 ||
    !(await EmbedService.resolveToken(token, getPublicOrigin(request)))
  )
    return deadLink();
  const { default: html } = await import("virtual:openseo-mcp-widget");
  const nonce = crypto.randomUUID();
  const page: EmbedPage = { token, widgets };
  // JSON in a data block: `<` is escaped so no value can close the tag.
  const config = `<script type="application/json" id="${EMBED_PAGE_ELEMENT_ID}">${JSON.stringify(page).replaceAll("<", "\\u003c")}</script>`;
  const body = html
    .replace("<script>", `<script nonce="${nonce}">`)
    .replace('<div id="root"></div>', `${config}<div id="root"></div>`);
  return new Response(body, {
    headers: {
      ...PUBLIC_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": embedCsp(nonce),
    },
  });
}

// Only tools that read saved data or Search Console: nothing a link holder
// runs can spend the project's credits or change it.
const EMBED_TOOL_DEFINITIONS = {
  [WidgetTool.RankTracker]: getRankTrackerTool,
  [WidgetTool.SearchConsole]: getSearchConsolePerformanceTool,
} as const;

const embedToolSchema = z.enum([
  WidgetTool.RankTracker,
  WidgetTool.SearchConsole,
]);

type EmbedToolArgs = Parameters<
  (typeof EMBED_TOOL_DEFINITIONS)[keyof typeof EMBED_TOOL_DEFINITIONS]["handler"]
>[0];

function resultText(result: CallToolResult) {
  return result.content
    .flatMap((item) => (item.type === "text" ? [item.text] : []))
    .join("\n");
}

/** Runs one widget tool call for the link's project and returns its snapshot. */
export async function runEmbedCall(token: string, request: Request) {
  const link = await EmbedService.resolveToken(token, getPublicOrigin(request));
  if (!link) return deadLink();

  // Search Console calls go to Google on the project's connection, so one
  // link can't be used to spend its quota.
  const limiter = env.EMBED_RATE_LIMIT;
  if (limiter && !(await limiter.limit({ key: token })).success)
    return jsonResponse(
      { error: "Too many requests. Wait a minute, then refresh." },
      429,
    );

  const call = widgetContextSchema.safeParse(
    await request.json().catch(() => null),
  );
  const tool = embedToolSchema.safeParse(call.data?.tool);
  if (!call.success || !tool.success)
    return jsonResponse({ error: "This widget isn't available here." }, 400);

  const definition = EMBED_TOOL_DEFINITIONS[tool.data];
  const args = objectSchema(definition.config.inputSchema).safeParse({
    ...call.data.arguments,
    projectId: link.projectId,
  });
  if (!args.success)
    return jsonResponse({ error: "This widget request isn't valid." }, 400);

  let result: CallToolResult;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- parsed against this tool's own inputSchema just above
    result = await definition.handler(args.data as EmbedToolArgs, {
      auth: link.auth,
    });
  } catch (error) {
    if (!asAppError(error)) {
      console.error("embed.call failed:", error);
      return jsonResponse({ error: "Couldn't load this widget." }, 500);
    }
    return jsonResponse({ error: toolErrorMessage(error) }, 400);
  }
  if (result.isError || !result.structuredContent)
    return jsonResponse(
      { error: resultText(result) || "Couldn't load this widget." },
      400,
    );
  const snapshot: WidgetSnapshot = widgetSnapshotSchema.parse({
    context: { tool: tool.data, arguments: args.data },
    data: result.structuredContent,
    text: resultText(result),
  });
  return jsonResponse(snapshot);
}
