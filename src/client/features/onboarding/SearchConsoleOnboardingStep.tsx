import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { SelfHostedSetupWarning } from "@/client/features/gsc/SelfHostedSetupWarning";
import {
  SitePicker,
  type GscSiteSelection,
} from "@/client/features/gsc/SitePicker";
import { startGscLink } from "@/client/features/gsc/startGscLink";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import type { ProjectMarket } from "@/client/features/projects/types";
import {
  getGscConnection,
  listGscSites,
  setGscSite,
} from "@/serverFunctions/gsc";
import { getProjects, setProjectMarket } from "@/serverFunctions/projects";

const GRANT_STATUS_KEY = ["gscGrantStatus"];

/**
 * Onboarding step for connecting Google Search Console: link the account-level
 * OAuth grant, then bind a verified property to the user's first project —
 * the same binding the project's Integrations page does — so it's done in one
 * place.
 */
export function SearchConsoleOnboardingStep() {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projectsQuery.data?.[0];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          Connect with Google Search Console now?
        </h2>

        {project ? <GscConnect projectId={project.id} /> : <Checking />}

        <p className="hidden sm:block text-xs leading-relaxed text-base-content/55">
          For now, Search Console data flows through the OpenSEO MCP. We're
          building it into the OpenSEO app soon too.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Choose country &amp; language</h2>
        {project ? <DefaultMarketPicker project={project} /> : <Checking />}
      </div>
    </div>
  );
}

/**
 * Sets the project's default market during onboarding, so keyword, SERP, and
 * domain data lands on the user's market from their first search instead of
 * defaulting to the US. Saves on change — the step's Continue button belongs
 * to the wizard, so a separate Save here would be easy to walk past.
 */
function DefaultMarketPicker({
  project,
}: {
  project: { id: string; locationCode: number; languageCode: string };
}) {
  const queryClient = useQueryClient();
  const [market, setMarket] = React.useState<ProjectMarket>({
    locationCode: project.locationCode,
    languageCode: project.languageCode,
  });

  const saveMutation = useMutation({
    mutationFn: (next: ProjectMarket) =>
      setProjectMarket({ data: { projectId: project.id, ...next } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleChange = (next: ProjectMarket) => {
    setMarket(next);
    saveMutation.mutate(next);
  };

  return (
    <div className="space-y-2">
      <ProjectMarketFields
        value={market}
        onChange={handleChange}
        hideLanguageOnMobile
      />
      <p className="hidden sm:block text-xs leading-relaxed text-base-content/55">
        We'll use this country and language for keyword, SERP, and domain data
        unless you pick a different one. You can change it in project settings.
      </p>
    </div>
  );
}

/** Connect + pick-a-property flow, scoped to a known project. */
function GscConnect({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = React.useState<GscSiteSelection | null>(
    null,
  );

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
  const accounts = React.useMemo(
    () => sitesQuery.data?.accounts ?? [],
    [sitesQuery.data?.accounts],
  );
  const requiresReconnect = accounts.some(
    (account) => account.requiresReconnect,
  );

  React.useEffect(() => {
    if (!requiresReconnect) return;

    void queryClient.invalidateQueries({
      queryKey: ["gscConnection", projectId],
    });
    void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
  }, [requiresReconnect, queryClient, projectId]);

  const setSiteMutation = useMutation({
    mutationFn: (selected: GscSiteSelection) =>
      setGscSite({ data: { projectId, ...selected } }),
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
        error={sitesQuery.isError}
        accounts={accounts}
        selection={selection}
        onSelect={setSelection}
        onSave={() => selection && setSiteMutation.mutate(selection)}
        saving={setSiteMutation.isPending}
        onRetry={() => void sitesQuery.refetch()}
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
