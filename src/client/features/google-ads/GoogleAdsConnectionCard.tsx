import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  GoogleAdsAccountPicker,
  type AccountSelection,
} from "@/client/features/google-ads/GoogleAdsAccountPicker";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { ConnectionStatusPill } from "@/client/features/integrations/GoogleConnectionCard";
import { GoogleLinkErrorAlert } from "@/client/features/integrations/GoogleLinkErrorAlert";
import { GoogleOAuthSetupWarning } from "@/client/features/integrations/GoogleOAuthSetupWarning";
import { GoogleAdsLogo } from "@/client/features/integrations/GoogleProductLogos";
import {
  startGoogleLink,
  useGoogleLinkPending,
} from "@/client/features/integrations/startGoogleLink";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  disconnectGoogleAds,
  getGoogleAdsConnection,
  listGoogleAdsAccounts,
  setGoogleAdsAccount,
} from "@/serverFunctions/google-ads";
import { GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/google-ads";

export function GoogleAdsConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const linking = useGoogleLinkPending();
  const [picking, setPicking] = React.useState(false);
  const [selection, setSelection] = React.useState<AccountSelection | null>(
    null,
  );
  const connectionKey = ["googleAdsConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getGoogleAdsConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connectionUnavailable = connectionQuery.isError && !connection;
  const connected = Boolean(connection?.connected);
  const needsGoogleOAuthSetup =
    connectionQuery.isSuccess && !connection?.googleOAuthConfigured;
  const showPicker = picking || (connection?.currentUserHasGrant && !connected);
  const accountsQuery = useQuery({
    queryKey: ["googleAdsAccounts", projectId],
    queryFn: () => listGoogleAdsAccounts({ data: { projectId } }),
    enabled: Boolean(showPicker && !needsGoogleOAuthSetup),
  });
  const grants = React.useMemo(
    () => accountsQuery.data?.accounts ?? [],
    [accountsQuery.data?.accounts],
  );

  // Keep the selection reconciled with what the picker is actually offering.
  // A refetch can drop the account the user had selected (permission revoked,
  // renamed, moved managers); leaving the stale pick in place lets "Use this
  // account" save a customer the list no longer contains.
  React.useEffect(() => {
    if (!accountsQuery.data) return;
    const offered = grants.flatMap((grant) =>
      grant.accounts.map((candidate) => ({ grant, candidate })),
    );
    const stillOffered = offered.some(
      ({ grant, candidate }) =>
        grant.accountId === selection?.accountId &&
        candidate.customerId === selection.customerId,
    );
    if (stillOffered) return;
    const marked = offered.find(({ candidate }) => candidate.isSelected);
    setSelection(
      marked
        ? {
            accountId: marked.grant.accountId,
            customerId: marked.candidate.customerId,
            loginCustomerId: marked.candidate.loginCustomerId,
          }
        : null,
    );
  }, [accountsQuery.data, grants, selection]);

  const invalidateConnectionState = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey });
    void queryClient.invalidateQueries({
      queryKey: ["dashboardActivation", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["dashboardLocalServicesReport", projectId],
    });
  };
  const setAccountMutation = useMutation({
    mutationFn: (selected: AccountSelection) =>
      setGoogleAdsAccount({ data: { projectId, ...selected } }),
    onSuccess: () => {
      captureClientEvent("google_ads:account_select");
      toast.success("Google Ads connected");
      setPicking(false);
      invalidateConnectionState();
    },
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGoogleAds({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Google Ads disconnected");
      setPicking(false);
      setSelection(null);
      invalidateConnectionState();
    },
  });
  const handleConnect = () =>
    void startGoogleLink("gads", window.location.href);

  return (
    <CardShell
      title="Google Ads (Local Services)"
      icon={<GoogleAdsLogo className="size-5" />}
      action={
        connectionQuery.isPending || connectionUnavailable ? undefined : (
          <ConnectionStatusPill
            connected={connected && !needsGoogleOAuthSetup}
            setupRequired={needsGoogleOAuthSetup}
            connection={connection}
          />
        )
      }
    >
      <GoogleLinkErrorAlert provider="gads" className="mb-4" />
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
        <QueryError
          error={connectionQuery.error}
          fallback="Couldn't check this project's connection."
          onRetry={() => void connectionQuery.refetch()}
          isRetrying={connectionQuery.isFetching}
        />
      ) : needsGoogleOAuthSetup ? (
        <GoogleOAuthSetupWarning
          integrationName="Google Ads"
          docsUrl={GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL}
        />
      ) : connected && !picking ? (
        <ConnectedState
          customerId={connection?.customerId ?? ""}
          descriptiveName={connection?.customerDescriptiveName ?? null}
          currencyCode={connection?.currencyCode ?? null}
          connectedByEmail={connection?.connectedByEmail ?? null}
          developerTokenConfigured={Boolean(
            connection?.developerTokenConfigured,
          )}
          onChange={() => {
            setSelection(null);
            setPicking(true);
          }}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : showPicker ? (
        <GoogleAdsAccountPicker
          loading={accountsQuery.isLoading}
          error={accountsQuery.isError}
          grants={grants}
          selection={selection}
          onSelect={setSelection}
          onSave={() => selection && setAccountMutation.mutate(selection)}
          saving={setAccountMutation.isPending}
          linking={linking}
          onRetry={() => void accountsQuery.refetch()}
          onCancel={connected ? () => setPicking(false) : undefined}
          onReconnect={handleConnect}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Connect Google Ads to track Local Services Ads leads, spend, and
            budget pacing next to your organic data.
          </p>
          <div className="mt-auto flex flex-wrap items-center justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnect}
              pending={linking}
            >
              {linking ? null : <GoogleGlyph className="size-[18px]" />}
              {linking ? "Opening Google…" : "Connect"}
            </Button>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function ConnectedState({
  customerId,
  descriptiveName,
  currencyCode,
  connectedByEmail,
  developerTokenConfigured,
  onChange,
  onDisconnect,
  disconnecting,
}: {
  customerId: string;
  descriptiveName: string | null;
  currencyCode: string | null;
  connectedByEmail: string | null;
  developerTokenConfigured: boolean;
  onChange: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold">
          {descriptiveName ?? customerId}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          ID {customerId}
          {currencyCode ? ` · ${currencyCode}` : ""}
        </p>
        {connectedByEmail ? (
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {connectedByEmail}
          </p>
        ) : null}
      </div>
      {!developerTokenConfigured ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            GOOGLE_ADS_DEVELOPER_TOKEN is not set on this deployment, so reports
            can&apos;t run yet.
          </AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={disconnecting}
        className="flex flex-wrap items-center gap-1"
      >
        <Button variant="outline" size="sm" onClick={onChange}>
          Change account
        </Button>
        <Button variant="destructive" size="sm" onClick={onDisconnect}>
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </Button>
      </fieldset>
    </div>
  );
}
