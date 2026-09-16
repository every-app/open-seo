import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { BingGlyph } from "@/client/features/bing/BingGlyph";
import { bingConnectionOptions } from "@/client/features/bing/bingConnectionQueries";
import {
  disconnectBing,
  listBingSites,
  saveBingApiKey,
  setBingSite,
} from "@/serverFunctions/bing";
import { BING_GET_API_KEY_URL, BING_SETUP_DOCS_URL } from "@/shared/bing";

/** Bing Webmaster Tools connection card. Unlike GSC/GA4 this is API-key auth,
 *  not OAuth: the user pastes a key generated at bing.com/webmasters ->
 *  Settings -> API Access, we validate it against GetUserSites and store it
 *  encrypted, then they pick which verified site maps to this project. */
export function BingConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  const [selectedSite, setSelectedSite] = React.useState<string | null>(null);

  const connectionOptions = bingConnectionOptions(projectId);
  const connectionKey = connectionOptions.queryKey;
  const connectionQuery = useQuery(connectionOptions);
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const hasKey = Boolean(connection?.currentUserHasKey);
  const canManage = connection?.canManage === true;

  const showPicker = picking || (!connected && hasKey && canManage);
  const sitesQuery = useQuery({
    queryKey: ["bingSites", projectId],
    queryFn: () => listBingSites(),
    enabled: showPicker && hasKey,
  });
  const sites = sitesQuery.data?.sites ?? [];

  const invalidateDownstream = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey });
    queryClient.removeQueries({ queryKey: ["bingSites", projectId] });
    void queryClient.invalidateQueries({
      queryKey: ["bingPerformance", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["bingPerformanceTable", projectId],
    });
  };

  const saveKeyMutation = useMutation({
    mutationFn: (apiKey: string) => saveBingApiKey({ data: { apiKey } }),
    onSuccess: () => {
      captureClientEvent("bing:key_saved");
      toast.success("Bing Webmaster API key saved");
      setApiKeyInput("");
      setPicking(true);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      void queryClient.invalidateQueries({
        queryKey: ["bingSites", projectId],
      });
    },
  });

  const setSiteMutation = useMutation({
    mutationFn: (siteUrl: string) =>
      setBingSite({ data: { projectId, siteUrl } }),
    onSuccess: () => {
      captureClientEvent("bing:property_select");
      toast.success("Bing Webmaster Tools connected");
      setPicking(false);
      setSelectedSite(null);
      invalidateDownstream();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectBing({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Bing Webmaster Tools disconnected from this project");
      setPicking(false);
      setSelectedSite(null);
      invalidateDownstream();
    },
  });

  const status = connectionQuery.isPending
    ? undefined
    : connected
      ? "connected"
      : undefined;

  return (
    <IntegrationConnectionCard
      title="Bing Webmaster Tools"
      icon={<BingGlyph className="size-5" />}
      status={status}
    >
      {connectionQuery.isPending ? (
        <div
          role="status"
          aria-label="Loading connection"
          className="space-y-3 animate-pulse"
        >
          <div className="h-4 w-2/3 rounded bg-base-200" />
          <div className="h-9 w-24 rounded bg-base-200" />
        </div>
      ) : connected && !picking ? (
        <div className="space-y-3 text-sm">
          <p>
            Connected to{" "}
            <span className="font-medium">{connection?.siteUrl}</span>
          </p>
          {canManage ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPicking(true)}
              >
                Change property
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={disconnectMutation.isPending}
                onClick={() => disconnectMutation.mutate()}
              >
                Disconnect
              </button>
            </div>
          ) : null}
        </div>
      ) : showPicker ? (
        <div className="space-y-3">
          {sitesQuery.isLoading ? (
            <p className="text-sm text-base-content/60">Loading sites…</p>
          ) : sitesQuery.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p className="text-error">Couldn't load your Bing sites.</p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void sitesQuery.refetch()}
              >
                Try again
              </button>
            </div>
          ) : sites.length === 0 ? (
            <p className="text-sm text-base-content/60">
              No verified sites found on this API key's Bing Webmaster account.
              Verify a site at bing.com/webmasters first.
            </p>
          ) : (
            <fieldset className="space-y-2">
              {sites.map((site) => (
                <label
                  key={site.Url}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-300 p-2.5 text-sm hover:bg-base-200"
                >
                  <input
                    type="radio"
                    name="bing-site"
                    className="radio radio-sm"
                    checked={selectedSite === site.Url}
                    onChange={() => setSelectedSite(site.Url)}
                  />
                  {site.Url}
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!selectedSite || setSiteMutation.isPending}
              onClick={() =>
                selectedSite && setSiteMutation.mutate(selectedSite)
              }
            >
              {setSiteMutation.isPending ? "Saving…" : "Save"}
            </button>
            {connected ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={setSiteMutation.isPending}
                onClick={() => {
                  setPicking(false);
                  setSelectedSite(null);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (apiKeyInput.trim()) {
              saveKeyMutation.mutate(apiKeyInput);
            }
          }}
        >
          <p className="text-sm text-base-content/70">
            Generate an API key at{" "}
            <a
              href={BING_GET_API_KEY_URL}
              target="_blank"
              rel="noreferrer"
              className="link"
            >
              bing.com/webmasters
            </a>{" "}
            (Settings → API Access → Generate API Key), then paste it here. The
            key covers every site verified on your Bing account. See the{" "}
            <a
              href={BING_SETUP_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="link"
            >
              setup guide
            </a>{" "}
            for a walkthrough with screenshots.
          </p>
          <input
            type="password"
            className="input input-bordered input-sm w-full"
            placeholder="Bing Webmaster API key"
            value={apiKeyInput}
            disabled={!canManage || saveKeyMutation.isPending}
            onChange={(event) => setApiKeyInput(event.target.value)}
            aria-label="Bing Webmaster API key"
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={
              !canManage || !apiKeyInput.trim() || saveKeyMutation.isPending
            }
          >
            {saveKeyMutation.isPending ? "Validating…" : "Save key"}
          </button>
        </form>
      )}
      {saveKeyMutation.isError ||
      setSiteMutation.isError ||
      disconnectMutation.isError ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {getStandardErrorMessage(
            saveKeyMutation.error ??
              setSiteMutation.error ??
              disconnectMutation.error,
          )}
        </p>
      ) : null}
      {connectionQuery.isSuccess && !canManage ? (
        <p className="mt-3 text-sm text-base-content/60">
          Ask an organization owner or admin to change this project's
          connection.
        </p>
      ) : null}
    </IntegrationConnectionCard>
  );
}
