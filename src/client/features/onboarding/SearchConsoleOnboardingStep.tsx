import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { GoogleLinkErrorAlert } from "@/client/features/integrations/GoogleLinkErrorAlert";
import { SelfHostedSetupWarning } from "@/client/features/gsc/SelfHostedSetupWarning";
import {
  SitePicker,
  type GscSiteSelection,
} from "@/client/features/gsc/SitePicker";
import {
  startGoogleLink,
  useGoogleLinkPending,
} from "@/client/features/integrations/startGoogleLink";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  getGscConnection,
  listGscSites,
  setGscSite,
} from "@/serverFunctions/gsc";
import { getProjects } from "@/serverFunctions/projects";
import { brand } from "@/shared/brand";

const GRANT_STATUS_KEY = ["gscGrantStatus"];

/**
 * Onboarding step for connecting Google Search Console: link the account-level
 * OAuth grant, then bind a verified property to the user's first project — the
 * same binding the project's Integrations page does. The step lives before the
 * agent-setup screen because most users leave onboarding from that screen.
 */
type NavigationProps = {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function SearchConsoleOnboardingStep(props: NavigationProps) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projectsQuery.data?.[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect Google Search Console now?
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-base-content/60">
          Bring your real clicks and queries into {brand.name} and your AI
          agent. You can also do this later from the dashboard.
        </p>
      </div>

      {project ? (
        <GscConnect key={project.id} projectId={project.id} {...props} />
      ) : (
        <>
          <Checking />
          <StepNavigation {...props} />
        </>
      )}
    </div>
  );
}

/** Connect + pick-a-property flow, scoped to a known project. */
function GscConnect({
  projectId,
  onNext,
  onBack,
  onSkip,
}: { projectId: string } & NavigationProps) {
  const queryClient = useQueryClient();
  const linking = useGoogleLinkPending();
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
  const needsSetup = Boolean(connection && !connection.googleOAuthConfigured);

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
      // The dashboard checklist reads the same connection state.
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      onNext();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleConnect = () => {
    captureClientEvent("onboarding:gsc_connect_clicked");
    // Google sends the user back to this URL, and the step lives in the URL,
    // so they land on this screen again with the grant in place.
    void startGoogleLink("gsc", window.location.href);
  };

  const busy = linking || setSiteMutation.isPending;
  const showPicker = hasGrant && !connected && !needsSetup;

  return (
    <fieldset disabled={busy}>
      {connectionQuery.isLoading ? (
        <Checking />
      ) : connectionQuery.isError && !connection ? (
        <div role="alert" className="text-sm">
          <p>Couldn't check your Google connection.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void connectionQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : needsSetup ? (
        <SelfHostedSetupWarning />
      ) : connected ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-3.5 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
            <Check className="size-3.5" />
          </span>
          <span className="text-base-content/80">
            Connected to{" "}
            <span className="font-mono">{connection?.siteUrl}</span>.
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          <GoogleLinkErrorAlert provider="gsc" />
          {hasGrant ? (
            <SitePicker
              linking={linking}
              loading={sitesQuery.isLoading}
              error={sitesQuery.isError}
              accounts={accounts}
              selection={selection}
              onSelect={setSelection}
              onSave={() =>
                selection && !busy && setSiteMutation.mutate(selection)
              }
              saveLabel="Save and continue"
              renderActions={(saveButton) => (
                <StepNavigation
                  onNext={onNext}
                  onBack={onBack}
                  onSkip={onSkip}
                  saveAction={saveButton}
                />
              )}
              saving={setSiteMutation.isPending}
              onRetry={() => void sitesQuery.refetch()}
              onReconnect={handleConnect}
            />
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={linking}
              aria-busy={linking}
              className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold text-base-content shadow-sm transition hover:bg-base-200 hover:shadow focus-visible:outline-2 focus-visible:outline-primary"
            >
              {linking ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <GoogleGlyph className="size-[18px]" />
              )}
              {linking ? "Opening Google…" : "Connect with Google"}
            </button>
          )}
        </div>
      )}
      {!showPicker && (
        <StepNavigation
          connected={connected}
          onNext={onNext}
          onBack={onBack}
          onSkip={onSkip}
        />
      )}
    </fieldset>
  );
}

function StepNavigation({
  connected = false,
  onNext,
  onBack,
  onSkip,
  saveAction,
}: NavigationProps & { connected?: boolean; saveAction?: React.ReactNode }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <button
        type="button"
        className="flex min-h-10 items-center gap-1.5 text-xs text-base-content/60 hover:text-base-content"
        onClick={onBack}
      >
        <ArrowLeft className="size-3.5" /> Back
      </button>
      <div className="flex items-center gap-2">
        {connected ? (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Continue <ArrowRight className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-base-content/55"
            onClick={onSkip}
          >
            Skip for now
          </button>
        )}
        {!connected &&
          (saveAction ?? (
            <button type="button" className="btn btn-primary btn-sm" disabled>
              Save and continue
            </button>
          ))}
      </div>
    </div>
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
