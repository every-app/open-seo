import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { SelfHostedSetupWarning } from "@/client/features/gsc/SelfHostedSetupWarning";
import { SitePicker } from "@/client/features/gsc/SitePicker";
import { startGscLink } from "@/client/features/gsc/startGscLink";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  getGscConnection,
  listGscSites,
  setGscSite,
} from "@/serverFunctions/gsc";
import { getOrCreateDefaultProject } from "@/serverFunctions/projects";

/**
 * Onboarding step for connecting Google Search Console: link the account-level
 * OAuth grant, then bind a verified property to the user's default project —
 * the same binding the project's Integrations page does — so it's done in one
 * place.
 */
export function SearchConsoleOnboardingStep() {
  const projectQuery = useQuery({
    queryKey: ["defaultProject"],
    queryFn: () => getOrCreateDefaultProject(),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        Connect with Google Search Console now?
      </h2>

      {projectQuery.data ? (
        <GscConnect projectId={projectQuery.data.id} />
      ) : (
        <Checking />
      )}

      <p className="text-xs leading-relaxed text-base-content/55">
        For now, Search Console data flows through the OpenSEO MCP. We're
        building it into the OpenSEO app soon too.
      </p>
    </div>
  );
}

/** Connect + pick-a-property flow, scoped to a known project. */
function GscConnect({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selectedSiteUrl, setSelectedSiteUrl] = React.useState("");

  const connectionKey = ["gscConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getGscConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const hasGrant = Boolean(connection?.currentUserHasGrant);
  const needsSetup =
    connectionQuery.isSuccess && !connection?.googleOAuthConfigured;

  const sitesQuery = useQuery({
    queryKey: ["gscSites", projectId],
    queryFn: () => listGscSites({ data: { projectId } }),
    enabled: hasGrant && !connected && !needsSetup,
  });
  const requiresReconnect = Boolean(sitesQuery.data?.requiresReconnect);

  React.useEffect(() => {
    if (!requiresReconnect) return;

    void queryClient.invalidateQueries({
      queryKey: ["gscConnection", projectId],
    });
  }, [requiresReconnect, queryClient, projectId]);

  const setSiteMutation = useMutation({
    mutationFn: (siteUrl: string) =>
      setGscSite({ data: { projectId, siteUrl } }),
    onSuccess: () => {
      captureClientEvent("gsc:property_select");
      void queryClient.invalidateQueries({ queryKey: connectionKey });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleConnect = () => {
    captureClientEvent("onboarding:gsc_connect_clicked");
    void startGscLink(window.location.href);
  };

  if (connectionQuery.isLoading) return <Checking />;

  if (needsSetup) {
    return <SelfHostedSetupWarning />;
  }

  if (connected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-3.5 text-sm">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
          <Check className="size-3.5" />
        </span>
        <span className="text-base-content/80">
          Connected to <span className="font-mono">{connection?.siteUrl}</span>.
        </span>
      </div>
    );
  }

  if (hasGrant) {
    return (
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
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold text-base-content shadow-sm transition hover:bg-base-200 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <GoogleGlyph className="size-[18px]" />
      Connect with Google
    </button>
  );
}

function Checking() {
  return (
    <div className="flex items-center gap-2 text-sm text-base-content/50">
      <span className="loading loading-spinner loading-sm" />
      Checking…
    </div>
  );
}
