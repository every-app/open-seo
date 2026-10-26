import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Skeleton } from "@/client/components/ui/skeleton";
import { safeHttpUrl } from "@/shared/safe-url";
import {
  WidgetTool,
  mcpMetaOutputSchema,
  searchConsoleSchema,
  serpSchema,
} from "@/shared/mcp-contracts";
import { useWidgetHost } from "./useWidgetHost";
import { SearchConsoleWidget } from "./SearchConsoleWidget";
import { SerpWidget } from "./SerpWidget";
// oxlint-disable-next-line import/no-unassigned-import -- Vite emits the widget's app stylesheet.
import "@/client/styles/app.css";
// oxlint-disable-next-line import/no-unassigned-import -- Widget document overrides follow the app stylesheet.
import "./widgets.css";

function Widget() {
  const host = useWidgetHost();
  const snapshot = host.snapshot;
  const meta = mcpMetaOutputSchema.safeParse(snapshot?.data.meta);
  const appUrl = safeHttpUrl(meta.success ? meta.data.url : undefined);
  const search =
    snapshot?.context.tool === WidgetTool.SearchConsole
      ? searchConsoleSchema.safeParse(snapshot.data)
      : null;
  const serp =
    snapshot?.context.tool === WidgetTool.Serp
      ? serpSchema.safeParse(snapshot.data)
      : null;
  return (
    <main className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <span className="font-medium">OpenSEO</span>
        {appUrl && (
          <Button
            variant="ghost"
            disabled={!host.isConnected || host.action.isPending}
            onClick={() => host.open(appUrl)}
          >
            Open in OpenSEO
            <ExternalLink />
          </Button>
        )}
      </header>
      {host.error && (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-wrap text-foreground">
            {host.error}
          </AlertDescription>
        </Alert>
      )}
      {!snapshot && !host.error ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="text-sm text-muted-foreground">
            Loading OpenSEO results…
          </span>
          <Skeleton className="h-10" />
          <Skeleton className="h-24" />
        </div>
      ) : search?.success ? (
        <SearchConsoleWidget host={host} data={search.data} />
      ) : serp?.success ? (
        <SerpWidget host={host} data={serp.data} />
      ) : snapshot ? (
        <p role="alert">
          Could not read these results. Ask your assistant to run the OpenSEO
          tool again.
        </p>
      ) : null}
      {host.notice && (
        <p role="status" className="text-sm">
          {host.notice}
        </p>
      )}
    </main>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Widget />
  </QueryClientProvider>,
);
