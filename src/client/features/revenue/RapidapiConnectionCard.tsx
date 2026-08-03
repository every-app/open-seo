import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  ConnectedState,
  IntegrationCard,
} from "@/client/features/integrations/integrationCardParts";
import {
  disconnectRapidapi,
  getRapidapiConnection,
  setRapidapiApi,
} from "@/serverFunctions/rapidapi";

/**
 * RapidAPI subscriptions connection. The key and GraphQL endpoint are
 * instance-level env secrets (RAPIDAPI_KEY, RAPIDAPI_GRAPHQL_URL), so
 * connecting is just entering which API listing's subscribers belong to this
 * project. The Platform API has no "list my APIs" query usable here, hence a
 * text field instead of a picker. See specs/0014.
 */
export function RapidapiConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [apiId, setApiId] = React.useState("");

  const connectionKey = ["rapidapiConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getRapidapiConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const needsSetup = connectionQuery.isSuccess && !connection?.configConfigured;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey });
    void queryClient.invalidateQueries({
      queryKey: ["rapidapiSubscriptions", projectId],
    });
  };

  const setMutation = useMutation({
    mutationFn: (rapidapiApiId: string) =>
      setRapidapiApi({ data: { projectId, rapidapiApiId } }),
    onSuccess: () => {
      toast.success("RapidAPI connected");
      setEditing(false);
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectRapidapi({ data: { projectId } }),
    onSuccess: () => {
      toast.success("RapidAPI disconnected");
      setEditing(false);
      setApiId("");
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <IntegrationCard
      title="RapidAPI Subscriptions"
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
      ) : connected && !editing ? (
        <ConnectedState
          glyph={
            <CircleDollarSign className="size-[18px] text-base-content/70" />
          }
          changeLabel="Change API"
          siteUrl={
            connection?.rapidapiApiName ?? connection?.rapidapiApiId ?? ""
          }
          connectedByEmail={null}
          onChange={() => {
            setApiId(connection?.rapidapiApiId ?? "");
            setEditing(true);
          }}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = apiId.trim();
            if (trimmed) setMutation.mutate(trimmed);
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">RapidAPI API id</span>
            <input
              type="text"
              value={apiId}
              onChange={(event) => setApiId(event.target.value)}
              placeholder="api_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="input input-bordered w-full font-mono text-xs"
            />
            <span className="text-xs text-base-content/50">
              From your provider dashboard: Products → your API → the id
              starting with "api_". Saving verifies it against the Platform API.
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!apiId.trim() || setMutation.isPending}
            >
              {setMutation.isPending ? "Verifying…" : "Save"}
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
    </IntegrationCard>
  );
}

function SetupWarning() {
  return (
    <p className="text-sm text-base-content/70">
      RapidAPI isn't configured on this deployment. Subscribe to your hub's
      GraphQL Platform API, then set{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        RAPIDAPI_KEY
      </code>{" "}
      and{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        RAPIDAPI_GRAPHQL_URL
      </code>{" "}
      (via{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        npx wrangler secret put
      </code>{" "}
      or .env.local in development).
    </p>
  );
}
