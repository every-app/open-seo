import { AlertTriangle } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { GSC_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/gsc";

/**
 * Shown in self-hosted deployments that haven't set GOOGLE_CLIENT_ID/SECRET yet
 * — in both the Integrations card and the onboarding step.
 */
export function SelfHostedSetupWarning() {
  return (
    <div className="alert alert-warning items-start text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">Google OAuth client not configured</p>
        <p className="text-base-content/70">
          Add your Google client ID and secret to this OpenSEO deployment before
          connecting Search Console.
        </p>
        <SafeExternalLink
          url={GSC_SELF_HOSTED_SETUP_DOCS_URL}
          label="Open setup guide"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        />
      </div>
    </div>
  );
}
