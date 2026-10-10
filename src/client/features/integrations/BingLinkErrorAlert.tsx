import * as React from "react";
import { X } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  clearBingLinkError,
  getBingLinkError,
  reportBingLinkErrorOnce,
} from "./bingLinkError";

function linkErrorCopy(code: string): { title: string; description: string } {
  if (code === "access_denied") {
    return {
      title: "Bing connection declined",
      description:
        "You declined the Bing Webmaster Tools consent screen. Connect again when you're ready — nothing was stored.",
    };
  }
  return {
    title: "Couldn't connect Bing",
    description:
      "Bing didn't complete the connection. Try connecting again; if it keeps failing, paste an API key instead.",
  };
}

/**
 * Inline error shown on a connect surface after a failed Bing link flow. The
 * OAuth callback sends failures back to the page that started the connect
 * (see bingOAuth.ts); bingLinkError.ts captures the params before the router
 * can redirect them away, and this renders the explanation next to the
 * Connect button that retries it. Persists until dismissed or the user
 * navigates.
 */
export function BingLinkErrorAlert({ className }: { className?: string }) {
  const [error] = React.useState(() => getBingLinkError());
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (error) reportBingLinkErrorOnce();
  }, [error]);

  if (!error || dismissed) return null;
  const copy = linkErrorCopy(error.code);

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
            clearBingLinkError();
          }}
        >
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}
