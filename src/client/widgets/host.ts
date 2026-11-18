import type { WidgetContext, WidgetSnapshot } from "@/shared/mcp-contracts";

/**
 * What a widget needs from wherever it is drawn. An MCP App gets snapshots
 * through the conversation (useMcpHost); an embed link fetches them from its
 * own data endpoint (useEmbedHost). Widgets only see this.
 */
export type WidgetHost = {
  snapshot: WidgetSnapshot | undefined;
  /** Shows an earlier snapshot again without another call. */
  restore: (value: WidgetSnapshot) => void;
  /** Runs the widget's tool with new arguments and shows the result. */
  call: (context: WidgetContext, onSuccess?: () => void) => void;
  open: (href: string) => void;
  busy: boolean;
  notice: string | undefined;
  error: string | undefined;
  isConnected: boolean;
  /** Only inside a conversation: the assistant to talk to and the user's project to change. */
  conversation?: {
    clientName: string | undefined;
    ask: (prompt: string, context: unknown) => void;
    saveKeywords: (
      projectId: unknown,
      keywords: string[],
      onSaved: () => void,
    ) => void;
  };
};
