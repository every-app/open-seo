import { ga4ConnectionOptions } from "@/client/features/integrations/googleConnectionQueries";
import * as React from "react";
import { GoogleConnectedState } from "@/client/features/integrations/GoogleConnectedState";
import { useGooglePickerResume } from "@/client/features/integrations/useGooglePickerResume";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ga4PropertyPicker,
  type Ga4PropertySelection,
} from "@/client/features/ga4/Ga4PropertyPicker";
import { GoogleProjectEmptyState } from "@/client/features/integrations/GoogleProjectEmptyState";
import { GoogleLinkErrorAlert } from "@/client/features/integrations/GoogleLinkErrorAlert";
import { GoogleOAuthSetupWarning } from "@/client/features/integrations/GoogleOAuthSetupWarning";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { GoogleAnalyticsLogo } from "@/client/features/integrations/GoogleProductLogos";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  disconnectGa4,
  listGa4Properties,
  setGa4Property,
} from "@/serverFunctions/ga4";
import { GA4_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/ga4";

import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";

export function GoogleAnalyticsConnectionCard({
  projectId,
  onDismiss,
  dismissing = false,
  heading,
}: {
  projectId: string;
  onDismiss?: () => void;
  dismissing?: boolean;
  heading?: React.ReactNode;
}) {
  const hosted = isHostedClientAuthMode();
  const queryClient = useQueryClient();
  const { picking, setPicking, linkAccount, linking } = useGooglePickerResume(
    "ga4",
    projectId,
  );
  const [selection, setSelection] = React.useState<Ga4PropertySelection | null>(
    null,
  );
  const connectionOptions = ga4ConnectionOptions(projectId);
  const connectionKey = connectionOptions.queryKey;
  const connectionQuery = useQuery(connectionOptions);
  const connection = connectionQuery.data;
  const connectionUnavailable = connectionQuery.isError && !connection;
  const connected = Boolean(connection?.connected);
  const hasGrant = Boolean(connection?.currentUserHasGrant);
  const canManage = connection?.canManage === true;
  const selfHostedNeedsSetup =
    !hosted && connectionQuery.isSuccess && !connection?.googleOAuthConfigured;
  const showPicker = picking ?? (!connected && hasGrant && canManage);
  const propertiesQuery = useQuery({
    queryKey: ["ga4Properties", projectId],
    queryFn: () => listGa4Properties({ data: { projectId } }),
    enabled: Boolean(showPicker && !selfHostedNeedsSetup),
  });
  const accounts = React.useMemo(
    () => propertiesQuery.data?.accounts ?? [],
    [propertiesQuery.data?.accounts],
  );

  React.useEffect(() => {
    if (!picking || !connected || selection) return;
    for (const account of accounts) {
      const selectedProperty = account.properties.find(
        (property) => property.isSelected,
      );
      if (selectedProperty) {
        setSelection({
          accountId: account.accountId,
          propertyId: selectedProperty.propertyId,
        });
        return;
      }
    }
  }, [accounts, selection, picking, connected]);

  const invalidateReports = () => {
    void queryClient.invalidateQueries({
      queryKey: ["dashboardActivation", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["dashboardGa4Report", projectId],
    });
  };
  const setPropertyMutation = useMutation({
    mutationFn: (selected: Ga4PropertySelection) =>
      setGa4Property({ data: { projectId, ...selected } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(connectionKey, (current: typeof connection) =>
        current ? { ...current, ...saved } : current,
      );
      captureClientEvent("ga4:property_select");
      toast.success("Google Analytics connected");
      queryClient.removeQueries({ queryKey: ["ga4Properties", projectId] });
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      setPicking(false);
      invalidateReports();
    },
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGa4({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Google Analytics disconnected from this project");
      queryClient.setQueryData(connectionKey, (current: typeof connection) =>
        current ? { ...current, connected: false } : current,
      );
      queryClient.removeQueries({ queryKey: ["ga4Properties", projectId] });
      setPicking(false);
      setSelection(null);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      invalidateReports();
    },
  });
  const changingConnection =
    setPropertyMutation.isPending || disconnectMutation.isPending || linking;
  const dismissDisabled = dismissing || changingConnection;
  const handleConnect = () => void linkAccount(window.location.href);

  return (
    <>
      {heading}
      <IntegrationConnectionCard
        title="Google Analytics"
        icon={<GoogleAnalyticsLogo className="size-5" />}
        status={
          connectionQuery.isPending || connectionUnavailable
            ? undefined
            : selfHostedNeedsSetup
              ? "setup_required"
              : connected
                ? "connected"
                : "disconnected"
        }
      >
        <GoogleLinkErrorAlert provider="ga4" className="mb-4" />
        {connectionQuery.isPending ? (
          <div
            role="status"
            aria-label="Loading connection"
            className="space-y-3"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-24" />
          </div>
        ) : connectionUnavailable ? (
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
          <div className="space-y-3">
            <GoogleOAuthSetupWarning
              integrationName="Google Analytics"
              docsUrl={GA4_SELF_HOSTED_SETUP_DOCS_URL}
            />
            <DismissButton onClick={onDismiss} disabled={dismissDisabled} />
          </div>
        ) : connected && !picking ? (
          <GoogleConnectedState
            property={connection?.propertyDisplayName ?? ""}
            detail={connection?.propertyId}
            canManageAccounts={hasGrant}
            email={connection?.connectedByEmail}
            onChange={() => {
              setPropertyMutation.reset();
              disconnectMutation.reset();
              setSelection(null);
              setPicking(true);
            }}
            onDisconnect={() => {
              setPropertyMutation.reset();
              disconnectMutation.mutate();
            }}
            disconnecting={disconnectMutation.isPending}
            disabled={linking}
            canManage={canManage}
          />
        ) : showPicker ? (
          <fieldset disabled={changingConnection}>
            <Ga4PropertyPicker
              readOnly={!canManage}
              linking={linking}
              loading={propertiesQuery.isLoading}
              error={propertiesQuery.isError}
              accounts={accounts}
              selection={selection}
              onSelect={setSelection}
              onSave={() => selection && setPropertyMutation.mutate(selection)}
              saving={setPropertyMutation.isPending}
              secondaryAction={{
                label: "Cancel",
                disabled: setPropertyMutation.isPending,
                onClick: () => {
                  setPicking(false);
                  setSelection(null);
                  setPropertyMutation.reset();
                },
              }}
              onRetry={() => void propertiesQuery.refetch()}
              onReconnect={handleConnect}
            />
          </fieldset>
        ) : (
          <GoogleProjectEmptyState
            name="Google Analytics"
            hasGrant={hasGrant}
            canManage={canManage}
            disabled={linking}
            onLink={handleConnect}
            onChoose={() => {
              setPropertyMutation.reset();
              disconnectMutation.reset();
              setSelection(null);
              setPicking(true);
            }}
          >
            <DismissButton onClick={onDismiss} disabled={dismissDisabled} />
          </GoogleProjectEmptyState>
        )}
        {showPicker && onDismiss && !connected ? (
          <DismissButton onClick={onDismiss} disabled={dismissDisabled} />
        ) : null}
        {setPropertyMutation.isError || disconnectMutation.isError ? (
          <p role="alert" className="mt-3 text-sm text-negative">
            {getStandardErrorMessage(
              setPropertyMutation.error ?? disconnectMutation.error,
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
    </>
  );
}

function DismissButton({
  onClick,
  disabled,
}: {
  onClick?: () => void;
  disabled: boolean;
}) {
  if (!onClick) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      className="text-muted-foreground"
      onClick={onClick}
      disabled={disabled}
    >
      Dismiss
    </Button>
  );
}
