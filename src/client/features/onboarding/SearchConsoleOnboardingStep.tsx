import * as React from "react";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { QueryError } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { GoogleLinkErrorAlert } from "@/client/features/integrations/GoogleLinkErrorAlert";
import {
  GooglePropertyPicker,
  type GooglePickerSelection,
} from "@/client/features/integrations/GooglePropertyPicker";
import {
  googleConnectionOptions,
  googleProviders,
} from "@/client/features/integrations/googleProviders";
import {
  startGoogleLink,
  useGoogleLinkPending,
} from "@/client/features/integrations/startGoogleLink";
import { captureClientEvent } from "@/client/lib/posthog";
import { Button } from "@/client/components/ui/button";
import { Spinner as SpinnerIcon } from "@/client/components/ui/spinner";
import { WizardFooter } from "@/client/features/onboarding/WizardFooter";

const GRANT_STATUS_KEY = ["gscGrantStatus"];

/**
 * Onboarding step for connecting Google Search Console: link the account-level
 * OAuth grant, then bind a verified property to the user's first project — the
 * same binding the project's Integrations page does.
 */
type NavigationProps = {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function SearchConsoleOnboardingStep(props: NavigationProps) {
  const projectsQuery = useQuery(projectsQueryOptions());
  const project = projectsQuery.data?.[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect Google Search Console now?
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Bring your real clicks and queries into OpenSEO and your AI agent. You
          can also do this later from the dashboard.
        </p>
      </div>

      {project ? (
        <GscConnect key={project.id} projectId={project.id} {...props} />
      ) : (
        <>
          {projectsQuery.isError ? (
            <QueryError
              error={projectsQuery.error}
              fallback="Couldn't load your project."
              onRetry={() => void projectsQuery.refetch()}
              isRetrying={projectsQuery.isFetching}
            />
          ) : (
            <Spinner size="sm" label="Checking…" />
          )}
          <WizardFooter
            onBack={props.onBack}
            onSkip={props.onSkip}
            skipLabel="Skip for now"
            continueLabel="Save and continue"
          />
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
  const [selection, setSelection] =
    React.useState<GooglePickerSelection | null>(null);

  const connectionOptions = googleConnectionOptions("gsc", projectId);
  const connectionKey = connectionOptions.queryKey;
  const connectionQuery = useQuery(connectionOptions);
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const hasGrant = Boolean(connection?.currentUserHasGrant);

  const sitesQuery = useQuery({
    queryKey: [googleProviders.gsc.accountsKey, projectId],
    queryFn: () => googleProviders.gsc.listAccounts(projectId),
    enabled: hasGrant && !connected,
  });
  const accounts = sitesQuery.data?.accounts ?? [];
  const requiresReconnect = accounts.some(
    (account) => account.requiresReconnect,
  );

  React.useEffect(() => {
    if (!requiresReconnect) return;

    void queryClient.invalidateQueries({
      queryKey: googleConnectionOptions("gsc", projectId).queryKey,
    });
    void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
  }, [requiresReconnect, queryClient, projectId]);

  const setSiteMutation = useMutation({
    mutationFn: (selected: GooglePickerSelection) =>
      googleProviders.gsc.save(projectId, selected),
    onSuccess: () => {
      captureClientEvent("gsc:property_select");
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      // The dashboard checklist reads the same connection state.
      void queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      });
      onNext();
    },
  });

  const handleConnect = () => {
    captureClientEvent("onboarding:gsc_connect_clicked");
    // Google sends the user back to this URL, and the step lives in the URL,
    // so they land on this screen again with the grant in place.
    void startGoogleLink("gsc", window.location.href);
  };

  const busy = linking || setSiteMutation.isPending;
  const showPicker = hasGrant && !connected;

  return (
    <fieldset disabled={busy} className="min-w-0">
      {connectionQuery.isLoading ? (
        <Spinner size="sm" label="Checking…" />
      ) : connectionQuery.isError && !connection ? (
        <QueryError
          fallback="Couldn't check your Google connection."
          onRetry={() => void connectionQuery.refetch()}
          isRetrying={connectionQuery.isFetching}
        />
      ) : connected ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-3.5 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
            <Check className="size-3.5" />
          </span>
          <span className="min-w-0 text-foreground/80">
            Connected to{" "}
            <span className="font-mono break-all">{connection?.property}</span>.
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          <GoogleLinkErrorAlert provider="gsc" />
          {hasGrant ? (
            <GooglePropertyPicker
              provider="gsc"
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
                <WizardFooter
                  onBack={onBack}
                  onSkip={onSkip}
                  skipLabel="Skip for now"
                  continueAction={saveButton}
                />
              )}
              saving={setSiteMutation.isPending}
              onRetry={() => void sitesQuery.refetch()}
              onReconnect={handleConnect}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-auto gap-2.5 bg-card px-4 py-2.5 font-semibold shadow-sm hover:bg-background hover:shadow dark:border-border dark:bg-card dark:hover:bg-background"
              onClick={handleConnect}
              disabled={linking}
              aria-busy={linking}
            >
              {linking ? (
                <SpinnerIcon />
              ) : (
                <GoogleGlyph className="size-[18px]" />
              )}
              {linking ? "Opening Google…" : "Connect with Google"}
            </Button>
          )}
        </div>
      )}
      {!showPicker && (
        <WizardFooter
          onBack={onBack}
          onSkip={connected ? undefined : onSkip}
          skipLabel="Skip for now"
          onContinue={connected ? onNext : undefined}
          continueLabel={connected ? "Continue" : "Save and continue"}
        />
      )}
    </fieldset>
  );
}
