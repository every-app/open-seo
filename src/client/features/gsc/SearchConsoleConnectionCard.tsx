import { gscConnectionOptions } from "@/client/features/integrations/googleConnectionQueries";
import * as React from "react";
import { GoogleConnectedState } from "@/client/features/integrations/GoogleConnectedState";
import { useGooglePickerResume } from "@/client/features/integrations/useGooglePickerResume";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { GoogleProjectEmptyState } from "@/client/features/integrations/GoogleProjectEmptyState";
import { GoogleLinkErrorAlert } from "@/client/features/integrations/GoogleLinkErrorAlert";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { GoogleSearchConsoleLogo } from "@/client/features/integrations/GoogleProductLogos";
import { SelfHostedSetupWarning } from "@/client/features/gsc/SelfHostedSetupWarning";
import {
  SitePicker,
  type GscSiteSelection,
} from "@/client/features/gsc/SitePicker";
import { disconnectGsc, listGscSites, setGscSite } from "@/serverFunctions/gsc";

import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";

const GRANT_STATUS_KEY = ["gscGrantStatus"];

export function SearchConsoleConnectionCard({
  projectId,
  returnTo,
}: {
  projectId: string;
  returnTo?: string;
}) {
  const hosted = isHostedClientAuthMode();
  const queryClient = useQueryClient();
  const { picking, setPicking, linkAccount, linking } = useGooglePickerResume(
    "gsc",
    projectId,
  );
  const [selection, setSelection] = React.useState<GscSiteSelection | null>(
    null,
  );

  const connectionOptions = gscConnectionOptions(projectId);
  const connectionKey = connectionOptions.queryKey;
  const connectionQuery = useQuery(connectionOptions);
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const hasGrant = Boolean(connection?.currentUserHasGrant);
  const canManage = connection?.canManage === true;
  const selfHostedNeedsSetup =
    !hosted && connectionQuery.isSuccess && !connection?.googleOAuthConfigured;

  const showPicker = picking ?? (!connected && hasGrant && canManage);
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
    if (!picking || !connected || selection) return;
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
  }, [accounts, selection, picking, connected]);

  const setSiteMutation = useMutation({
    mutationFn: (selected: GscSiteSelection) =>
      setGscSite({ data: { projectId, ...selected } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(connectionKey, (current: typeof connection) =>
        current ? { ...current, ...saved } : current,
      );
      captureClientEvent("gsc:property_select");
      toast.success("Search Console connected");
      queryClient.removeQueries({ queryKey: ["gscSites", projectId] });
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      setPicking(false);
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
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGsc({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Search Console disconnected from this project");
      queryClient.setQueryData(connectionKey, (current: typeof connection) =>
        current ? { ...current, connected: false } : current,
      );
      queryClient.removeQueries({ queryKey: ["gscSites", projectId] });
      setPicking(false);
      setSelection(null);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
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
  });

  const handleConnect = () =>
    void linkAccount(returnTo ?? window.location.href);

  return (
    <IntegrationConnectionCard
      title="Google Search Console"
      icon={<GoogleSearchConsoleLogo className="size-5" />}
      status={
        connectionQuery.isPending || (connectionQuery.isError && !connection)
          ? undefined
          : selfHostedNeedsSetup
            ? "setup_required"
            : connected
              ? "connected"
              : "disconnected"
      }
    >
      <GoogleLinkErrorAlert provider="gsc" className="mb-4" />
      {connectionQuery.isPending ? (
        <div
          role="status"
          aria-label="Loading connection"
          className="space-y-3"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-9 w-24" />
        </div>
      ) : connectionQuery.isError && !connection ? (
        <div role="alert" className="space-y-3 text-sm">
          <p className="text-negative">
            Couldn't check this project's connection.
          </p>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => void connectionQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : selfHostedNeedsSetup ? (
        <SelfHostedSetupWarning />
      ) : connected && !picking ? (
        <GoogleConnectedState
          property={connection?.siteUrl ?? ""}
          canManageAccounts={hasGrant}
          email={connection?.connectedByEmail}
          onChange={() => {
            setSiteMutation.reset();
            disconnectMutation.reset();
            setSelection(null);
            setPicking(true);
          }}
          onDisconnect={() => {
            setSiteMutation.reset();
            disconnectMutation.mutate();
          }}
          disconnecting={disconnectMutation.isPending}
          disabled={linking}
          canManage={canManage}
        />
      ) : showPicker ? (
        <fieldset disabled={linking || setSiteMutation.isPending}>
          <SitePicker
            readOnly={!canManage}
            linking={linking}
            loading={sitesQuery.isLoading}
            error={sitesQuery.isError}
            accounts={accounts}
            selection={selection}
            onSelect={setSelection}
            onSave={() => selection && setSiteMutation.mutate(selection)}
            saving={setSiteMutation.isPending}
            secondaryAction={{
              label: "Cancel",
              disabled: setSiteMutation.isPending,
              onClick: () => {
                setPicking(false);
                setSelection(null);
                setSiteMutation.reset();
              },
            }}
            onRetry={() => void sitesQuery.refetch()}
            onReconnect={handleConnect}
          />
        </fieldset>
      ) : (
        <GoogleProjectEmptyState
          name="Search Console"
          hasGrant={hasGrant}
          canManage={canManage}
          disabled={linking}
          onLink={handleConnect}
          onChoose={() => {
            setSiteMutation.reset();
            disconnectMutation.reset();
            setSelection(null);
            setPicking(true);
          }}
        ></GoogleProjectEmptyState>
      )}
      {setSiteMutation.isError || disconnectMutation.isError ? (
        <p role="alert" className="mt-3 text-sm text-negative">
          {getStandardErrorMessage(
            setSiteMutation.error ?? disconnectMutation.error,
          )}
        </p>
      ) : null}
      {connectionQuery.isSuccess && !selfHostedNeedsSetup && !canManage ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Ask an organization owner or admin to change this project's
          connection.
        </p>
      ) : null}
    </IntegrationConnectionCard>
  );
}
