import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GoogleAdsAccountPicker,
  type AccountSelection,
} from "@/client/features/google-ads/GoogleAdsAccountPicker";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { GoogleLinkErrorAlert } from "@/client/features/integrations/GoogleLinkErrorAlert";
import { GoogleOAuthSetupWarning } from "@/client/features/integrations/GoogleOAuthSetupWarning";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { GoogleAdsLogo } from "@/client/features/integrations/GoogleProductLogos";
import { startGoogleLink } from "@/client/features/integrations/startGoogleLink";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  disconnectGoogleAds,
  getGoogleAdsConnection,
  listGoogleAdsAccounts,
  setGoogleAdsAccount,
} from "@/serverFunctions/google-ads";
import { GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/google-ads";

export function GoogleAdsConnectionCard({ projectId }: { projectId: string }) {
  const hosted = isHostedClientAuthMode();
  const queryClient = useQueryClient();
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
  const connected = Boolean(connection?.connected);
  const selfHostedNeedsSetup =
    !hosted && connectionQuery.isSuccess && !connection?.googleOAuthConfigured;
  const showPicker = picking || (connection?.currentUserHasGrant && !connected);
  const accountsQuery = useQuery({
    queryKey: ["googleAdsAccounts", projectId],
    queryFn: () => listGoogleAdsAccounts({ data: { projectId } }),
    enabled: Boolean(showPicker && !selfHostedNeedsSetup),
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
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGoogleAds({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Google Ads disconnected");
      setPicking(false);
      setSelection(null);
      invalidateConnectionState();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const handleConnect = () =>
    void startGoogleLink("gads", window.location.href);

  return (
    <IntegrationConnectionCard
      title="Google Ads (Local Services)"
      icon={<GoogleAdsLogo className="size-5" />}
      status={
        connectionQuery.isLoading
          ? undefined
          : selfHostedNeedsSetup
            ? "setup_required"
            : connection?.reconnectRequired
              ? "reconnect_required"
              : connected
                ? "connected"
                : "disconnected"
      }
    >
      <GoogleLinkErrorAlert provider="gads" className="mb-4" />
      {connectionQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Checking…
        </div>
      ) : selfHostedNeedsSetup ? (
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
          onRetry={() => void accountsQuery.refetch()}
          onCancel={connected ? () => setPicking(false) : undefined}
          onReconnect={handleConnect}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            Connect Google Ads to track Local Services Ads leads, spend, and
            budget pacing next to your organic data.
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
    </IntegrationConnectionCard>
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
    <div className="space-y-3">
      <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-base-content/45">
              Selected Ads account
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold">
              {descriptiveName ?? customerId}
            </p>
          </div>
          <span className="rounded-md border border-base-300 bg-base-100 px-2 py-1 font-mono text-[11px] text-base-content/60">
            ID {customerId}
          </span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-base-300/70 pt-3 text-xs sm:grid-cols-2">
          {currencyCode ? (
            <div>
              <dt className="text-base-content/45">Currency</dt>
              <dd className="mt-0.5 font-medium text-base-content/75">
                {currencyCode}
              </dd>
            </div>
          ) : null}
          {connectedByEmail ? (
            <div className="min-w-0">
              <dt className="text-base-content/45">Connected account</dt>
              <dd className="mt-0.5 truncate font-medium text-base-content/75">
                {connectedByEmail}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
      {!developerTokenConfigured ? (
        <div className="alert alert-warning items-start text-sm">
          <p>
            GOOGLE_ADS_DEVELOPER_TOKEN is not set on this deployment, so reports
            can&apos;t run yet.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm border-base-300 font-medium"
          onClick={onChange}
        >
          Change account
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm font-medium text-error hover:bg-error/10"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}
