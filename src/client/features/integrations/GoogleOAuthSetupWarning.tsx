import { AlertTriangle } from "@/client/components/icons";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
export function GoogleOAuthSetupWarning({
  integrationName,
  docsUrl,
}: {
  integrationName: string;
  docsUrl: string;
}) {
  return (
    <Alert variant="warning" className="text-sm">
      <AlertTriangle className="size-4 shrink-0" />
      <AlertDescription className="space-y-1">
        <p className="font-medium">Google OAuth client not configured</p>
        <p className="text-foreground/80">
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
