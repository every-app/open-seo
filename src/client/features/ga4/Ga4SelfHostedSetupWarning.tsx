import { AlertTriangle } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { GA4_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/ga4";

/**
 * Shown in self-hosted deployments that haven't set GOOGLE_CLIENT_ID/SECRET yet
 * — in the Integrations card. Same OAuth client as Search Console; this warns
 * independently since a deployment could plausibly configure one connection
 * before the other's docs are followed.
 */
export function Ga4SelfHostedSetupWarning() {
  return (
    <div className="alert alert-warning items-start text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">Google OAuth client not configured</p>
        <p className="text-base-content/70">
          Add your Google client ID and secret to this OpenSEO deployment
          before connecting Analytics.
        </p>
        <SafeExternalLink
          url={GA4_SELF_HOSTED_SETUP_DOCS_URL}
          label="Open setup guide"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        />
      </div>
    </div>
  );
}
