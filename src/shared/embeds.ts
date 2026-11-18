import { z } from "zod";
import { WidgetTool, type WidgetContext } from "@/shared/mcp-contracts";

// Embed links: a project's widgets served on their own, read-only and live, for
// other dashboards to frame (a GoHighLevel custom menu link or dashboard Embed
// widget). The token is the capability, minted like a report share token.

export enum EmbedWidget {
  Rankings = "rankings",
  SearchConsole = "search-console",
}

/**
 * The tool call each widget opens with. The server pins the link's project
 * onto every call, so none of these name one, and runs only the tools these
 * widgets use (see src/server/features/embeds/embedRoutes.ts).
 */
export const EMBED_WIDGET_CONTEXTS: Record<EmbedWidget, WidgetContext> = {
  [EmbedWidget.Rankings]: { tool: WidgetTool.RankTracker, arguments: {} },
  [EmbedWidget.SearchConsole]: {
    tool: WidgetTool.SearchConsole,
    arguments: { dimensions: ["query"] },
  },
};

/** What the embed page hands the widget bundle. */
export const embedPageSchema = z.object({
  token: z.string(),
  widgets: z.array(z.enum(EmbedWidget)).min(1),
});

export type EmbedPage = z.infer<typeof embedPageSchema>;

/** The element id the page's JSON travels in. */
export const EMBED_PAGE_ELEMENT_ID = "openseo-embed";

/** A page's link: one widget, or without one the overview of them all. */
export const embedPath = (token: string, widget?: EmbedWidget) =>
  widget ? `/e/${token}/${widget}` : `/e/${token}`;

/** Where the embed host runs a widget's tool calls. */
export const embedDataPath = (token: string) => `/e/${token}/data`;
