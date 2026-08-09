import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { Ga4SelfHostedSetupWarning } from "@/client/features/ga4/Ga4SelfHostedSetupWarning";
import {
  PropertyPicker,
  type Ga4PropertySelection,
} from "@/client/features/ga4/PropertyPicker";
import { startGa4Link } from "@/client/features/ga4/startGa4Link";
import {
  disconnectGa4,
  getGa4Connection,
  listGa4Properties,
  setGa4Property,
} from "@/serverFunctions/ga4";

const GRANT_STATUS_KEY = ["ga4GrantStatus"];

export function AnalyticsConnectionCard({
  projectId,
}: {
  projectId: string;
}) {
  const hosted = isHostedClientAuthMode();
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [selection, setSelection] = React.useState<Ga4PropertySelection | null>(
    null,
  );

  const connectionKey = ["ga4Connection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getGa4Connection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const selfHostedNeedsSetup =
    !hosted && connectionQuery.isSuccess && !connection?.googleOAuthConfigured;

  const showPicker = picking || (connection?.currentUserHasGrant && !connected);
  const propertiesQuery = useQuery({
    queryKey: ["ga4Properties", projectId],
    queryFn: () => listGa4Properties({ data: { projectId } }),
    enabled: Boolean(showPicker && !selfHostedNeedsSetup),
  });
  const accounts = React.useMemo(
    () => propertiesQuery.data?.accounts ?? [],
    [propertiesQuery.data?.accounts],
  );
  const requiresReconnect = accounts.some(
    (account) => account.requiresReconnect,
  );

  React.useEffect(() => {
    if (!requiresReconnect) return;

    void queryClient.invalidateQueries({
      queryKey: ["ga4Connection", projectId],
    });
    void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
  }, [requiresReconnect, queryClient, projectId]);

  React.useEffect(() => {
    if (selection) return;
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
  }, [accounts, selection]);

  const setPropertyMutation = useMutation({
    mutationFn: (selected: Ga4PropertySelection) =>
      setGa4Property({ data: { projectId, ...selected } }),
    onSuccess: () => {
      captureClientEvent("ga4:property_select");
      toast.success("Analytics connected");
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGa4({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Analytics disconnected");
      setPicking(false);
      setSelection(null);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      // Disconnect can drop the account-level grant server-side; keep the
      // shared grant-status cache (onboarding step + re-engagement nudge) honest.
      void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleConnect = () => void startGa4Link(window.location.href);

  return (
    <IntegrationCard
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
        <Ga4SelfHostedSetupWarning />
      ) : connected && !picking ? (
        <ConnectedState
          propertyId={connection?.propertyId ?? ""}
          propertyDisplayName={connection?.propertyDisplayName ?? null}
          connectedByEmail={connection?.connectedByEmail ?? null}
          onChange={() => {
            setSelection(null);
            setPicking(true);
          }}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : showPicker ? (
        <PropertyPicker
          loading={propertiesQuery.isLoading}
          error={propertiesQuery.isError}
          accounts={accounts}
          selection={selection}
          onSelect={setSelection}
          onSave={() => selection && setPropertyMutation.mutate(selection)}
          saving={setPropertyMutation.isPending}
          onRetry={() => void propertiesQuery.refetch()}
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
            Connect Analytics to see total visits and channel mix (search,
            direct, referral, email) — data Search Console can't provide.
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

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

function IntegrationCard({
  status,
  children,
}: {
  status?: "connected" | "disconnected" | "setup_required";
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <h2 className="text-base font-semibold leading-tight">
          Google Analytics
        </h2>
        {status ? <StatusPill status={status} /> : null}
      </div>
      <div className="border-t border-base-300 p-5 sm:p-6">{children}</div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "connected" | "disconnected" | "setup_required";
}) {
  const connected = status === "connected";
  const setupRequired = status === "setup_required";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        connected
          ? "border-success/30 bg-success/10 text-success"
          : setupRequired
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-base-300 bg-base-200 text-base-content/60",
      ].join(" ")}
    >
      <span
        className={[
          "size-1.5 rounded-full",
          connected
            ? "bg-success"
            : setupRequired
              ? "bg-warning"
              : "bg-base-content/40",
        ].join(" ")}
      />
      {connected
        ? "Connected"
        : setupRequired
          ? "Setup required"
          : "Not connected"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Connected state
// ---------------------------------------------------------------------------

function ConnectedState({
  propertyId,
  propertyDisplayName,
  connectedByEmail,
  onChange,
  onDisconnect,
  disconnecting,
}: {
  propertyId: string;
  propertyDisplayName: string | null;
  connectedByEmail: string | null;
  onChange: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/40 p-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-md border border-base-300 bg-base-100">
          <GoogleGlyph className="size-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm">
            {propertyDisplayName ? (
              <>
                <span className="font-medium">{propertyDisplayName}</span>{" "}
                <span className="font-mono text-base-content/60">
                  ({propertyId})
                </span>
              </>
            ) : (
              <span className="font-mono">{propertyId}</span>
            )}
          </p>
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
          Change property
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
