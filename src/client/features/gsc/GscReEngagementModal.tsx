import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { startGoogleLink } from "@/client/features/integrations/startGoogleLink";
import { onboardingAnswersQueryOptions } from "@/client/features/onboarding/onboardingModel";
import { captureClientEvent } from "@/client/lib/posthog";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getGscGrantStatus } from "@/serverFunctions/gsc";
import { dismissGscNudge } from "@/serverFunctions/onboarding";

/**
 * One-time prompt nudging users who finished onboarding without the Search
 * Console step (legacy users, and users onboarded by an agent) to connect GSC. Hosted-only because this is
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
  const connectRef = React.useRef<HTMLButtonElement>(null);

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

  // Users who finished onboarding outside the wizard have no
  // gscNudgeDismissedAt set: legacy users from before the step existed, and
  // users whose agent completed onboarding by connecting over MCP or calling
  // create_project. Anyone who completes the wizard gets it stamped, and
  // dismissing/connecting clears it.
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
    // Land them on the project's integrations page so they can pick a property
    // right after granting access (the grant alone has no property bound yet).
    const callbackURL = projectId
      ? `${window.location.origin}/p/${projectId}/settings/integrations`
      : window.location.href;
    void startGoogleLink("gsc", callbackURL);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleDismiss();
      }}
    >
      <DialogContent className="sm:max-w-lg" initialFocus={connectRef}>
        <DialogHeader>
          <DialogTitle className="text-lg">
            Connect Google Search Console
          </DialogTitle>
          <DialogDescription>
            Bring your real clicks, impressions, and rankings into OpenSEO and
            query them from Claude or Codex over MCP. It never uses credits.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            className="px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
            onClick={handleDismiss}
          >
            Maybe later
          </button>
          <Button ref={connectRef} onClick={handleConnect}>
            {/* Google's mark needs a white tile to stay legible on a colored button. */}
            <span className="flex size-6 items-center justify-center rounded bg-white">
              <GoogleGlyph className="size-[16px]" />
            </span>
            Connect with Google
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
