import * as React from "react";
import { X } from "lucide-react";
import { googleAuthErrorCopy } from "./googleAuthErrorCopy";
import {
  clearGoogleLinkError,
  getGoogleLinkError,
  reportGoogleLinkErrorOnce,
  type GoogleLinkProvider,
} from "./googleLinkError";

import { Button } from "@/client/components/ui/button";
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
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm ${className ?? ""}`}
    >
      <div className="space-y-1">
        <p className="font-semibold text-destructive">{copy.title}</p>
        <p className="text-muted-foreground">{copy.description}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        aria-label="Dismiss"
        className="h-7 px-2.5 shrink-0 px-1.5"
        onClick={() => {
          setDismissed(true);
          clearGoogleLinkError();
        }}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
