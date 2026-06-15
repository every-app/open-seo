import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/client/components/Modal";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { startGscLink } from "@/client/features/gsc/startGscLink";
import { onboardingAnswersQueryOptions } from "@/client/features/onboarding/onboardingModel";
import { captureClientEvent } from "@/client/lib/posthog";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getGscGrantStatus } from "@/serverFunctions/gsc";
import { dismissGscNudge } from "@/serverFunctions/onboarding";

/**
 * One-time re-engagement prompt nudging users who finished onboarding *before*
 * the Search Console step existed to connect GSC. Hosted-only because this is
 * a hosted onboarding re-engagement nudge. Shows once — server-persisted
 * dismissal means it never reappears after the user connects or dismisses, on
 * any device.
 *
 * `suppressed` lets the layout hide this when another modal (e.g. the missing
 * DataForSEO key prompt) is already showing so the two never stack.
 */
export function GscReEngagementModal({
  projectId,
  suppressed,
}: {
  projectId: string | null;
  suppressed: boolean;
}) {
  const hosted = isHostedClientAuthMode();
  const queryClient = useQueryClient();
  const [closed, setClosed] = React.useState(false);
  const shownRef = React.useRef(false);

  const onboardingQuery = useQuery({
    ...onboardingAnswersQueryOptions(),
    enabled: hosted,
  });
  const grantQuery = useQuery({
    queryKey: ["gscGrantStatus"],
    queryFn: () => getGscGrantStatus(),
    enabled: hosted,
  });

  const dismissMutation = useMutation({
    mutationFn: () => dismissGscNudge(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["onboardingAnswers"] });
    },
  });

  // Legacy users — those who finished onboarding before it included the Search
  // Console step — have no gscNudgeDismissedAt set, so they're the only ones who
  // see this. Anyone who completes current onboarding gets it stamped (they
  // already saw that step), and dismissing/connecting clears it too.
  const eligible =
    hosted &&
    !suppressed &&
    !closed &&
    onboardingQuery.isSuccess &&
    grantQuery.isSuccess &&
    Boolean(onboardingQuery.data?.completedAt) &&
    !onboardingQuery.data?.gscNudgeDismissedAt &&
    !grantQuery.data?.connected;

  React.useEffect(() => {
    if (eligible && !shownRef.current) {
      shownRef.current = true;
      captureClientEvent("gsc:nudge_shown");
    }
  }, [eligible]);

  if (!eligible) return null;

  function persistDismiss() {
    setClosed(true);
    dismissMutation.mutate();
  }

  function handleDismiss() {
    captureClientEvent("gsc:nudge_dismissed");
    persistDismiss();
  }

  function handleConnect() {
    captureClientEvent("gsc:nudge_connect_clicked");
    // Resolve the nudge up front: the user is leaving for Google's consent
    // screen, and on return they'll either have a grant (which suppresses this
    // anyway) or have abandoned it — neither case should re-nag.
    persistDismiss();
    // Land them on the project's settings page so they can pick a property
    // right after granting access (the grant alone has no property bound yet).
    const callbackURL = projectId
      ? `${window.location.origin}/p/${projectId}/settings#search-console`
      : window.location.href;
    void startGscLink(callbackURL);
  }

  return (
    <Modal
      maxWidth="max-w-lg"
      onClose={handleDismiss}
      labelledBy="gsc-nudge-title"
    >
      <div className="space-y-1">
        <h2 id="gsc-nudge-title" className="text-lg font-semibold">
          New: Connect Google Search Console
        </h2>
        <p className="text-sm text-base-content/70">
          Bring your real clicks, impressions, and rankings into OpenSEO and
          query them from Claude or Codex over MCP. It never uses credits.
        </p>
      </div>

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost" onClick={handleDismiss}>
          Maybe later
        </button>
        <button
          type="button"
          onClick={handleConnect}
          className="inline-flex items-center justify-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold text-base-content shadow-sm transition hover:bg-base-200 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <GoogleGlyph className="size-[18px]" />
          Connect with Google
        </button>
      </div>
    </Modal>
  );
}
