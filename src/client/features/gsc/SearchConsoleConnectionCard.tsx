import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { SelfHostedSetupWarning } from "@/client/features/gsc/SelfHostedSetupWarning";
import {
  SitePicker,
  type GscSiteSelection,
} from "@/client/features/gsc/SitePicker";
import { startGscLink } from "@/client/features/gsc/startGscLink";
import {
  ConnectedState,
  IntegrationCard,
} from "@/client/features/integrations/integrationCardParts";
import {
  disconnectGsc,
  getGscConnection,
  listGscSites,
  setGscSite,
} from "@/serverFunctions/gsc";

const GRANT_STATUS_KEY = ["gscGrantStatus"];

export function SearchConsoleConnectionCard({
  projectId,
}: {
  projectId: string;
}) {
  const hosted = isHostedClientAuthMode();
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [selection, setSelection] = React.useState<GscSiteSelection | null>(
    null,
  );

  const connectionKey = ["gscConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getGscConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const selfHostedNeedsSetup =
    !hosted && connectionQuery.isSuccess && !connection?.googleOAuthConfigured;

  const showPicker = picking || (connection?.currentUserHasGrant && !connected);
  const sitesQuery = useQuery({
    queryKey: ["gscSites", projectId],
    queryFn: () => listGscSites({ data: { projectId } }),
    enabled: Boolean(showPicker && !selfHostedNeedsSetup),
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
      queryKey: ["gscConnection", projectId],
    });
    void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
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

  const setSiteMutation = useMutation({
    mutationFn: (selected: GscSiteSelection) =>
      setGscSite({ data: { projectId, ...selected } }),
    onSuccess: () => {
      captureClientEvent("gsc:property_select");
      toast.success("Search Console connected");
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
      // The Search Performance report caches {connected:false}; refresh it so
      // the page shows data right after connecting instead of the stale card.
      void queryClient.invalidateQueries({
        queryKey: ["searchPerformance", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["searchPerformanceTable", projectId],
      });
      // The dashboard embeds this card and swaps it for the Search
      // performance stats card once activation reports the connection.
      void queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["dashboardGscReport", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGsc({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Search Console disconnected");
      setPicking(false);
      setSelection(null);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      // Disconnect can drop the account-level grant server-side; keep the
      // shared grant-status cache (onboarding step + re-engagement nudge) honest.
      void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
      void queryClient.invalidateQueries({
        queryKey: ["searchPerformance", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["searchPerformanceTable", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["dashboardGscReport", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleConnect = () => void startGscLink(window.location.href);

  return (
    <IntegrationCard
      title="Google Search Console"
      status={
        connectionQuery.isLoading
          ? undefined
          : selfHostedNeedsSetup
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
      ) : selfHostedNeedsSetup ? (
        <SelfHostedSetupWarning />
      ) : connected && !picking ? (
        <ConnectedState
          glyph={<GoogleGlyph className="size-[18px]" />}
          changeLabel="Change property"
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
        <SitePicker
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
            Connect GSC to see how your website is actually performing in Google
            Search.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold text-base-content shadow-sm transition hover:bg-base-200 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <GoogleGlyph className="size-[18px]" />
            Connect with Google
          </button>
        </div>
      )}
    </IntegrationCard>
  );
}
