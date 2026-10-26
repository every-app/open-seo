import { AlertTriangle, Info } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";

// Switch to https://everyapp.com/docs/providers/google#connect-accounts (with
// #search-console and #google-analytics) once everyapp.com deploys the
// provider pages (merged in private-every-app #753); until then it 404s. Same link in
// search-console-tools.ts and selfhost-preflight.ts.
const EVERY_APP_GOOGLE_SETUP_URL = "https://everyapp.com/docs/connect-oauth";

export function GoogleOAuthSetupWarning({
  integrationName,
  docsUrl,
}: {
  integrationName: string;
  docsUrl: string;
}) {
  if (isEveryAppClientAuthMode()) {
    // Google connects through the gateway, which holds the Google client;
    // OpenSEO holds none here (server/features/google/googleAccess.ts).
    return (
      <Alert variant="info">
        <Info className="size-4" />
        <AlertTitle>Add Google to Every App first</AlertTitle>
        <AlertDescription>
          <p>
            An owner or admin does this once: create a Google OAuth client with
            the redirect URI{" "}
            <code>
              https://&lt;your gateway&gt;/connect/google-workspace/callback
            </code>
            , then paste its client ID and secret in Every App under Manage
            workspace → Providers, or run{" "}
            <code>
              pnpm everyapp secret set GOOGLE_WORKSPACE_CLIENT_ID
              GOOGLE_WORKSPACE_CLIENT_SECRET
            </code>
            . Then connect {integrationName} here.
          </p>
          <SafeExternalLink
            url={EVERY_APP_GOOGLE_SETUP_URL}
            label="How to add a provider"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
          />
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertTitle>Google OAuth client not configured</AlertTitle>
      <AlertDescription>
        <p>
          Add your Google client ID and secret to this OpenSEO deployment before
          connecting {integrationName}.
        </p>
        <SafeExternalLink
          url={docsUrl}
          label="Open setup guide"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        />
      </AlertDescription>
    </Alert>
  );
}
