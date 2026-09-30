import * as React from "react";
import { X } from "@/client/components/icons";
import { googleAuthErrorCopy } from "./googleAuthErrorCopy";
import {
  clearGoogleLinkError,
  getGoogleLinkError,
  reportGoogleLinkErrorOnce,
  type GoogleLinkProvider,
} from "./googleLinkError";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { cn } from "@/client/lib/utils";

const PROVIDER_LABELS: Record<GoogleLinkProvider, string> = {
  gsc: "Search Console",
  ga4: "Google Analytics",
};

/**
 * Inline error shown on a connect surface after a failed Google link flow.
 * startGoogleLink sends OAuth failures back to the page that started the
 * connect (see its errorCallbackURL); googleLinkError.ts captures the params
 * before the router can redirect them away, and this renders the explanation
 * next to the Connect button that retries it. Persists until dismissed or the
 * user navigates.
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
    <Alert
      variant="destructive"
      className={cn("flex items-start justify-between gap-3", className)}
    >
      <div>
        <AlertTitle className="font-semibold">{copy.title}</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          {copy.description}
        </AlertDescription>
      </div>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Dismiss"
        className="size-7 shrink-0"
        onClick={() => {
          setDismissed(true);
          clearGoogleLinkError();
        }}
      >
        <X className="size-3.5" />
      </Button>
    </Alert>
  );
}
