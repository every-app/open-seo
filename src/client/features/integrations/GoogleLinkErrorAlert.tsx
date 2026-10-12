import * as React from "react";
import { X } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { googleAuthErrorCopy } from "./googleAuthErrorCopy";
import {
  clearGoogleLinkError,
  getGoogleLinkError,
  reportGoogleLinkErrorOnce,
} from "./googleLinkError";
import type { GoogleLinkProvider } from "@/shared/google-link";

const PROVIDER_LABELS: Record<GoogleLinkProvider, string> = {
  gsc: "Search Console",
  ga4: "Google Analytics",
  gads: "Google Ads",
};

/**
 * Inline error shown on a connect surface after a failed Google link flow.
 * The OAuth callback sends failures back to the page that started the connect
 * (see googleOAuth.ts); googleLinkError.ts captures the params before the
 * router can redirect them away, and this renders the explanation next to the
 * Connect button that retries it. Persists until dismissed or the user
 * navigates.
 */
export function GoogleLinkErrorAlert({
  provider,
  className,
}: {
  provider: GoogleLinkProvider;
  className?: string;
}) {
  const [error] = React.useState(() => getGoogleLinkError(provider));
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (error) reportGoogleLinkErrorOnce();
  }, [error]);

  if (!error || dismissed) return null;
  const copy = googleAuthErrorCopy(error.code, PROVIDER_LABELS[provider]);

  return (
    <Alert variant="destructive" className={className}>
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
      <AlertAction>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true);
            clearGoogleLinkError();
          }}
        >
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}
