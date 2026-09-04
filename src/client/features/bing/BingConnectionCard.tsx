import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { BingGlyph } from "@/client/features/bing/BingGlyph";
import {
  BingSitePicker,
  type BingSiteSelection,
} from "@/client/features/bing/BingSitePicker";
import { startBingLink } from "@/client/features/bing/startBingLink";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import {
  disconnectBing,
  getBingConnection,
  listBingSites,
  setBingSite,
} from "@/serverFunctions/bing";

export function BingConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [selection, setSelection] = React.useState<BingSiteSelection | null>(
    null,
  );

  const connectionKey = ["bingConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getBingConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const needsSetup =
    connectionQuery.isSuccess && !connection?.bingOAuthConfigured;

  const showPicker = picking || (connection?.currentUserHasGrant && !connected);
  const sitesQuery = useQuery({
    queryKey: ["bingSites", projectId],
    queryFn: () => listBingSites({ data: { projectId } }),
    enabled: Boolean(showPicker && !needsSetup),
  });
  const accounts = React.useMemo(
    () => sitesQuery.data?.accounts ?? [],
    [sitesQuery.data?.accounts],
  );
  const requiresReconnect = accounts.some(
    (account) => account.requiresReconnect,
  );

  React.useEffect(() => {
    if (!requiresReconnect) return;

    void queryClient.invalidateQueries({
      queryKey: ["bingConnection", projectId],
    });
  }, [requiresReconnect, queryClient, projectId]);

  React.useEffect(() => {
    if (selection) return;
    for (const account of accounts) {
      const selectedSite = account.sites.find((site) => site.isSelected);
      if (selectedSite) {
        setSelection({
          accountId: account.accountId,
          siteUrl: selectedSite.siteUrl,
        });
        return;
      }
    }
  }, [accounts, selection]);

  const invalidateConnectionCaches = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey });
    // The performance page caches a not-connected result; refresh it so it
    // shows data straight after connecting rather than the stale connect card.
    void queryClient.invalidateQueries({
      queryKey: ["bingPerformance", projectId],
    });
  };

  const setSiteMutation = useMutation({
    mutationFn: (selected: BingSiteSelection) =>
      setBingSite({ data: { projectId, ...selected } }),
    onSuccess: () => {
      captureClientEvent("bing:site_select");
      toast.success("Bing Webmaster connected");
      setPicking(false);
      invalidateConnectionCaches();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectBing({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Bing Webmaster disconnected");
      setPicking(false);
      setSelection(null);
      invalidateConnectionCaches();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleConnect = () => void startBingLink(window.location.href);

  return (
    <IntegrationConnectionCard
      title="Bing Webmaster Tools"
      icon={<BingGlyph className="size-[18px]" />}
      status={
        connectionQuery.isLoading
          ? undefined
          : needsSetup
            ? "setup_required"
            : connected
              ? "connected"
              : "disconnected"
      }
    >
      {connectionQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Checking…
        </div>
      ) : needsSetup ? (
        <SetupWarning />
      ) : connected && !picking ? (
        <ConnectedState
          siteUrl={connection?.siteUrl ?? ""}
          connectedByEmail={connection?.connectedByEmail ?? null}
          onChange={() => {
            setSelection(null);
            setPicking(true);
          }}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : showPicker ? (
        <BingSitePicker
          loading={sitesQuery.isLoading}
          error={sitesQuery.isError}
          accounts={accounts}
          selection={selection}
          onSelect={setSelection}
          onSave={() => selection && setSiteMutation.mutate(selection)}
          saving={setSiteMutation.isPending}
          onRetry={() => void sitesQuery.refetch()}
          onReconnect={handleConnect}
          secondaryAction={
            connected
              ? { label: "Cancel", onClick: () => setPicking(false) }
              : {
                  label: "Disconnect",
                  destructive: true,
                  disabled: disconnectMutation.isPending,
                  onClick: () => disconnectMutation.mutate(),
                }
          }
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            Connect Bing Webmaster Tools to see clicks and impressions from Bing
            — the index behind Copilot and ChatGPT search.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold text-base-content shadow-sm transition hover:bg-base-200 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <BingGlyph className="size-[18px]" />
            Connect with Bing
          </button>
        </div>
      )}
    </IntegrationConnectionCard>
  );
}

/** Bing rejects localhost redirect URIs and allows one redirect URI per OAuth
 *  client, so self-hosters need their own registered client rather than a
 *  local flow. Say that plainly instead of offering a button that cannot work. */
function SetupWarning() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-base-content/70">
        Bing Webmaster isn't configured on this deployment. Register an OAuth
        client under Bing Webmaster Tools → Settings → API Access, then set{" "}
        <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
          BING_CLIENT_ID
        </code>{" "}
        ,{" "}
        <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
          BING_CLIENT_SECRET
        </code>
        , and a{" "}
        <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
          BETTER_AUTH_SECRET
        </code>{" "}
        of at least 32 characters, which keys token encryption.
      </p>
      <p className="text-xs text-base-content/55">
        The redirect URI is this deployment's{" "}
        <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
          /api/bing/oauth/callback
        </code>
        . Bing allows one redirect URI per client and rejects localhost, so each
        deployment needs its own registered client.
      </p>
    </div>
  );
}

function ConnectedState({
  siteUrl,
  connectedByEmail,
  onChange,
  onDisconnect,
  disconnecting,
}: {
  siteUrl: string;
  connectedByEmail: string | null;
  onChange: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/40 p-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-md border border-base-300 bg-base-100">
          <BingGlyph className="size-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm">{siteUrl}</p>
          {connectedByEmail ? (
            <p className="truncate text-xs text-base-content/55">
              Connected by {connectedByEmail}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onChange}
        >
          Change site
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-error hover:bg-error/10"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
