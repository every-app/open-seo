import { AlertTriangle, Info } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";

export function GoogleOAuthSetupWarning({
  integrationName,
  docsUrl,
}: {
  integrationName: string;
  docsUrl: string;
}) {
  if (isEveryAppClientAuthMode()) {
    // Google connects through the gateway's integrations, like DataForSEO,
    // once the gateway offers it; OpenSEO holds no Google client here
    // (server/features/google/googleAccess.ts).
    return (
      <Alert variant="info">
        <Info className="size-4" />
        <AlertTitle>Coming to Every App</AlertTitle>
        <AlertDescription>
          <p>
            {integrationName} will connect through Every App once it offers
            Google. Nothing to set up on your side yet.
          </p>
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
