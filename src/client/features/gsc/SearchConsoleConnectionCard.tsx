import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { SelfHostedSetupWarning } from "@/client/features/gsc/SelfHostedSetupWarning";
import { SitePicker } from "@/client/features/gsc/SitePicker";
import { startGscLink } from "@/client/features/gsc/startGscLink";
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
  const [selectedSiteUrl, setSelectedSiteUrl] = React.useState<string>("");

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
  const requiresReconnect = Boolean(sitesQuery.data?.requiresReconnect);

  React.useEffect(() => {
    if (!requiresReconnect) return;

    void queryClient.invalidateQueries({
      queryKey: ["gscConnection", projectId],
    });
    void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
  }, [requiresReconnect, queryClient, projectId]);

  const setSiteMutation = useMutation({
    mutationFn: (siteUrl: string) =>
      setGscSite({ data: { projectId, siteUrl } }),
    onSuccess: () => {
      captureClientEvent("gsc:property_select");
      toast.success("Search Console connected");
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGsc({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Search Console disconnected");
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      // Disconnect can drop the account-level grant server-side; keep the
      // shared grant-status cache (onboarding step + re-engagement nudge) honest.
      void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleConnect = () => void startGscLink(window.location.href);

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
        <SelfHostedSetupWarning />
      ) : connected && !picking ? (
        <ConnectedState
          siteUrl={connection?.siteUrl ?? ""}
          connectedByEmail={connection?.connectedByEmail ?? null}
          onChange={() => {
            setSelectedSiteUrl(connection?.siteUrl ?? "");
            setPicking(true);
          }}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : showPicker ? (
        <SitePicker
          loading={sitesQuery.isLoading}
          error={sitesQuery.isError || requiresReconnect}
          sites={sitesQuery.data?.sites ?? []}
          selectedSiteUrl={selectedSiteUrl}
          onSelect={setSelectedSiteUrl}
          onSave={() =>
            selectedSiteUrl && setSiteMutation.mutate(selectedSiteUrl)
          }
          saving={setSiteMutation.isPending}
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
            Real clicks, impressions, and rankings. Free.
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
        <div>
          <h2 className="text-base font-semibold leading-tight">
            Google Search Console
          </h2>
          <p className="mt-0.5 text-sm text-base-content/55">
            Your search data, straight from Google.
          </p>
        </div>
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
          <GoogleGlyph className="size-[18px]" />
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
