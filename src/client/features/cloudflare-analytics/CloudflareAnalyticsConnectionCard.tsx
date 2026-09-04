import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  connectCloudflareAnalytics,
  disconnectCloudflareAnalytics,
  getCloudflareAnalyticsConnection,
} from "@/serverFunctions/cloudflare-analytics";
import { CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX } from "@/shared/cloudflare-analytics";

const DOCS_URL =
  "https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/";

const CAPABILITY_LABELS = {
  traffic: "Traffic",
  securityEvents: "Security events",
  crawlerAccess: "Verified crawlers",
} as const;
const CAPABILITY_NAMES = [
  "traffic",
  "securityEvents",
  "crawlerAccess",
] as const;

export function CloudflareAnalyticsConnectionCard({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [apiToken, setApiToken] = React.useState("");
  const [zoneId, setZoneId] = React.useState("");
  const [zoneLabel, setZoneLabel] = React.useState("");
  const queryKey = ["cloudflareAnalyticsConnection", projectId];
  const connection = useQuery({
    queryKey,
    queryFn: () => getCloudflareAnalyticsConnection({ data: { projectId } }),
  });
  const connected = connection.data?.connected === true;
  const encryptionConfigured = connection.data?.encryptionConfigured === true;

  const connect = useMutation({
    mutationFn: () =>
      connectCloudflareAnalytics({
        data: {
          projectId,
          apiToken,
          zoneId,
          zoneLabel: zoneLabel || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Cloudflare Analytics connected");
      setApiToken("");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectCloudflareAnalytics({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Cloudflare Analytics disconnected");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  React.useEffect(() => {
    const data = connection.data;
    if (!data?.connected || editing) return;
    setZoneId(data.zoneId ?? "");
    setZoneLabel(data.zoneLabel ?? "");
  }, [connection.data, editing]);

  return (
    <IntegrationConnectionCard
      title="Cloudflare Analytics"
      icon={<Cloud className="size-5 text-[#f38020]" />}
      status={
        connection.isPending || connection.isError
          ? undefined
          : connected && encryptionConfigured
            ? "connected"
            : !encryptionConfigured
              ? "setup_required"
              : "disconnected"
      }
    >
      {connection.isPending ? (
        <p className="text-sm text-base-content/55">Checking connection…</p>
      ) : connection.isError ? (
        <div className="alert alert-error text-sm">
          <TriangleAlert className="size-4" />
          Could not load the Cloudflare connection.
        </div>
      ) : !encryptionConfigured ? (
        <div className="alert alert-warning items-start text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Set a stable <code>BETTER_AUTH_SECRET</code> of at least 32
            characters before storing an Analytics token.
          </span>
        </div>
      ) : connected && !editing ? (
        <ConnectedState
          zone={connection.data.zoneLabel ?? connection.data.zoneId ?? ""}
          tokenHint={connection.data.tokenHint ?? "Encrypted"}
          capabilities={connection.data.capabilities}
          disconnecting={disconnect.isPending}
          onEdit={() => setEditing(true)}
          onDisconnect={() => disconnect.mutate()}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            connect.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Analytics API token"
              value={apiToken}
              onChange={setApiToken}
              secret
              required
            />
            <Field
              label="Zone ID"
              value={zoneId}
              onChange={setZoneId}
              mono
              required
            />
            <Field
              label="Zone label (optional)"
              value={zoneLabel}
              onChange={setZoneLabel}
              placeholder="example.com"
            />
          </div>
          <div className="rounded-lg border border-base-300 bg-base-200/30 p-3 text-xs text-base-content/65">
            <ShieldCheck className="mr-2 inline size-4 text-success" />
            Use a separate read-only token. OpenSEO validates the selected zone
            before saving, encrypts the token, and never requests IP addresses,
            query strings, or full User-Agent values.
          </div>
          <a
            className="inline-flex items-center gap-1 text-xs link"
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Cloudflare token guide <ExternalLink className="size-3" />
          </a>
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={
                apiToken.trim().length < 20 ||
                zoneId.trim().length !== 32 ||
                connect.isPending
              }
            >
              {connect.isPending ? "Validating…" : "Connect Cloudflare"}
            </button>
            {connected ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      )}
    </IntegrationConnectionCard>
  );
}

function ConnectedState({
  zone,
  tokenHint,
  capabilities,
  disconnecting,
  onEdit,
  onDisconnect,
}: {
  zone: string;
  tokenHint: string;
  capabilities: Record<
    keyof typeof CAPABILITY_LABELS,
    { available: boolean; reason: string | null }
  >;
  disconnecting: boolean;
  onEdit: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <ConnectionValue label="Zone" value={zone} />
        <ConnectionValue label="Token" value={tokenHint} />
      </div>
      <div className="flex flex-wrap gap-2">
        {CAPABILITY_NAMES.map((name) => {
          const capability = capabilities[name];
          const retryable =
            !capability.available &&
            capability.reason?.startsWith(
              CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX,
            );
          return (
            <span
              key={name}
              title={
                retryable
                  ? "The initial probe failed temporarily; OpenSEO retries when this dataset is requested."
                  : (capability.reason ?? undefined)
              }
              className={`badge badge-sm ${capability.available ? "badge-success" : retryable ? "badge-warning" : "badge-ghost"}`}
            >
              {CAPABILITY_LABELS[name]}
              {retryable ? " · retryable" : ""}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onEdit}
        >
          Replace settings
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-error"
          disabled={disconnecting}
          onClick={onDisconnect}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}

function ConnectionValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/30 p-3">
      <p className="text-xs text-base-content/50">{label}</p>
      <p className="mt-1 truncate font-mono">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  secret,
  required,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  required?: boolean;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="form-control block">
      <span className="label-text text-sm font-medium">{label}</span>
      <input
        className={`input input-bordered mt-1 w-full text-sm ${mono ? "font-mono" : ""}`}
        type={secret ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
