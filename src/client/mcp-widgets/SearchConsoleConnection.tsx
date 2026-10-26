import { ExternalLink, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { safeHttpUrl } from "@/shared/safe-url";
import type { SearchConsoleData } from "@/shared/mcp-contracts";
import type { WidgetHost } from "./useWidgetHost";

export function SearchConsoleConnection({
  host,
  data,
}: {
  host: WidgetHost;
  data: SearchConsoleData;
}) {
  const input = host.snapshot!.context.arguments;
  const busy = host.action.isPending;
  const connectUrl = safeHttpUrl(data.connectUrl);
  const setupUrl = safeHttpUrl(data.setupDocsUrl);
  const connection = data.reason === "not_connected" || data.connectionRequired;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h1 className="text-xl font-semibold">
          {setupUrl
            ? "Set up Google Search Console"
            : connection
              ? "Connect Google Search Console"
              : "Couldn’t load Search Console data"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {setupUrl
            ? "This self-hosted OpenSEO instance needs Google OAuth configuration before you can connect a property."
            : connection
              ? "Connect Google and choose a Search Console property in OpenSEO. Then return here and check the connection. Your Google sign-in stays in OpenSEO."
              : host.snapshot?.text}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(connectUrl || setupUrl) && (
          <Button
            disabled={busy}
            onClick={() => host.open((setupUrl ?? connectUrl)!)}
          >
            {setupUrl
              ? "Setup instructions"
              : connection
                ? "Connect in OpenSEO"
                : "Check connection in OpenSEO"}
            <ExternalLink />
          </Button>
        )}
        <Button
          variant="outline"
          pending={busy}
          onClick={() => host.call(host.snapshot!.context)}
        >
          <RefreshCw />
          {connection ? "Check connection" : "Try again"}
        </Button>
      </div>
      <div className="border-t border-border pt-4">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            host.ask(
              "Help me research Google search results for this OpenSEO project. Ask me which keyword and market to use first.",
              { projectId: input.projectId },
            )
          }
        >
          <MessageSquare />
          Research a keyword instead
        </Button>
      </div>
    </section>
  );
}
