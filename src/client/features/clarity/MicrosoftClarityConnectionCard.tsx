import * as React from "react";
import {
  CircleAlert,
  ExternalLink,
  MousePointerClick,
  ShieldCheck,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  connectClarity,
  disconnectClarity,
  getClarityConnection,
} from "@/serverFunctions/clarity";

const CLARITY_TOKEN_DOCS_URL =
  "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api#obtaining-access-tokens";
const CLARITY_SELF_HOSTING_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_MICROSOFT_CLARITY.md";

export function MicrosoftClarityConnectionCard({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [apiToken, setApiToken] = React.useState("");
  const connectionKey = ["clarityConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getClarityConnection({ data: { projectId } }),
  });
  const connected = Boolean(connectionQuery.data?.connected);
  const encryptionConfigured = Boolean(
    connectionQuery.data?.encryptionConfigured,
  );

  const connectMutation = useMutation({
    mutationFn: () => connectClarity({ data: { projectId, apiToken } }),
    onSuccess: () => {
      captureClientEvent("clarity:connect");
      toast.success("Microsoft Clarity connected");
      setApiToken("");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      void queryClient.invalidateQueries({
        queryKey: ["clarityInsights", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectClarity({ data: { projectId } }),
    onSuccess: () => {
      captureClientEvent("clarity:disconnect");
      toast.success("Microsoft Clarity disconnected");
      setApiToken("");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      void queryClient.invalidateQueries({
        queryKey: ["clarityInsights", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <IntegrationConnectionCard
      title="Microsoft Clarity"
      icon={<MousePointerClick className="size-5 text-[#1673ff]" />}
      status={
        connectionQuery.isLoading || connectionQuery.isError
          ? undefined
          : connected && encryptionConfigured
            ? "connected"
            : "disconnected"
      }
    >
      {connectionQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Checking…
        </div>
      ) : connectionQuery.isError ? (
        <div className="alert alert-error items-start text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Could not load the Clarity connection</p>
            <p className="mt-1 text-xs opacity-80">
              The integration status is temporarily unavailable. No connection
              settings were changed.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-xs mt-2"
              onClick={() => void connectionQuery.refetch()}
              disabled={connectionQuery.isFetching}
            >
              {connectionQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        </div>
      ) : !encryptionConfigured ? (
        <ClaritySetupRequired
          connected={connected}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : connected && !editing ? (
        <ConnectedState
          projectId={projectId}
          tokenHint={connectionQuery.data?.tokenHint ?? ""}
          connectedAt={connectionQuery.data?.connectedAt ?? null}
          onReplace={() => setEditing(true)}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : (
        <TokenForm
          apiToken={apiToken}
          onTokenChange={setApiToken}
          onSubmit={() => connectMutation.mutate()}
          onCancel={
            connected
              ? () => {
                  setApiToken("");
                  setEditing(false);
                }
              : undefined
          }
          saving={connectMutation.isPending}
        />
      )}
    </IntegrationConnectionCard>
  );
}

function ClaritySetupRequired({
  connected,
  onDisconnect,
  disconnecting,
}: {
  connected: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="alert alert-warning items-start text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Credential encryption is not configured</p>
          <p className="mt-1 text-xs opacity-80">
            Set a stable <code>BETTER_AUTH_SECRET</code> of at least 32
            characters before connecting Clarity.
            {connected
              ? " Restore the original value; if it changed, reconnect the token."
              : ""}
          </p>
          <a
            href={CLARITY_SELF_HOSTING_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline"
          >
            Open setup guide
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
      {connected ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm font-medium text-error hover:bg-error/10"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect unavailable token"}
        </button>
      ) : null}
    </div>
  );
}

function TokenForm({
  apiToken,
  onTokenChange,
  onSubmit,
  onCancel,
  saving,
}: {
  apiToken: string;
  onTokenChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="clarity-api-token" className="text-sm font-medium">
          Data Export API token
        </label>
        <input
          id="clarity-api-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiToken}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="Paste the token generated by Clarity"
          className="input input-bordered w-full font-mono text-sm"
          disabled={saving}
        />
        <p className="text-xs text-base-content/55">
          Generate it in Clarity under Settings → Data Export. Only a Clarity
          project admin can create one.{" "}
          <a
            href={CLARITY_TOKEN_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Microsoft guide
            <ExternalLink className="size-3" />
          </a>
        </p>
      </div>

      <div className="rounded-lg border border-base-300 bg-base-200/30 px-3.5 py-3 text-xs text-base-content/65">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <p>
            OpenSEO validates the token server-side, stores it encrypted, and
            never sends it back to the browser or an MCP client.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="btn btn-primary btn-sm font-medium"
          disabled={apiToken.trim().length < 20 || saving}
        >
          {saving ? "Validating…" : "Connect Clarity"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-base-content/60"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ConnectedState({
  projectId,
  tokenHint,
  connectedAt,
  onReplace,
  onDisconnect,
  disconnecting,
}: {
  projectId: string;
  tokenHint: string;
  connectedAt: string | null;
  onReplace: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const connectedDate = connectedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(connectedAt),
      )
    : null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-base-content/45">
              Data Export access
            </p>
            <p className="mt-0.5 text-sm font-semibold">Read-only metrics</p>
            {connectedDate ? (
              <p className="mt-1 text-xs text-base-content/50">
                Connected {connectedDate}
              </p>
            ) : null}
          </div>
          <span className="rounded-md border border-base-300 bg-base-100 px-2 py-1 font-mono text-[11px] text-base-content/60">
            {tokenHint}
          </span>
        </div>
        <p className="mt-3 border-t border-base-300/70 pt-3 text-xs text-base-content/60">
          Reports are cached for 24 hours to stay within Clarity&apos;s daily
          API limit.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/p/$projectId/clarity"
          params={{ projectId }}
          className="btn btn-primary btn-sm font-medium"
        >
          View Clarity insights
        </Link>
        <button
          type="button"
          className="btn btn-outline btn-sm border-base-300 font-medium"
          onClick={onReplace}
        >
          Replace token
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
