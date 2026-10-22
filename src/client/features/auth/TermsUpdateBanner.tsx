import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { AppBanner } from "@/client/layout/AppBanner";
import { useSession } from "@/lib/auth-client";
import { acceptTermsUpdate } from "@/serverFunctions/terms";
import {
  CURRENT_TERMS_EFFECTIVE_DATE,
  CURRENT_TERMS_VERSION,
  PRIVACY_URL,
  TERMS_URL,
} from "@/shared/terms";

// Asks existing users to affirmatively accept updated Terms. It never blocks
// the app: a user who doesn't accept stays on their prior agreement.
export function TermsUpdateBanner() {
  const { data: session, refetch } = useSession();
  const acceptMutation = useMutation({
    mutationFn: () => acceptTermsUpdate(),
    // The session is served from a signed cookie cache, so bypass it to pick
    // up the new acceptance and hide the banner.
    onSuccess: () => refetch({ query: { disableCookieCache: true } }),
    onError: () => toast.error("We couldn't record your acceptance."),
  });

  if (!session || session.user.termsAcceptedVersion === CURRENT_TERMS_VERSION) {
    return null;
  }

  return (
    <AppBanner variant="info">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          We&rsquo;ve updated our{" "}
          <a href={TERMS_URL} target="_blank" rel="noreferrer">
            Terms
          </a>{" "}
          and{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>{" "}
          (effective {CURRENT_TERMS_EFFECTIVE_DATE}). Please review and accept.
        </span>
        <Button
          size="sm"
          pending={acceptMutation.isPending}
          onClick={() => acceptMutation.mutate()}
        >
          Accept
        </Button>
      </div>
    </AppBanner>
  );
}
