import { ShieldAlert } from "lucide-react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Card, CardContent, CardTitle } from "@/client/components/ui/card";
const CLOUDFLARE_SETUP_GUIDE_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_CLOUDFLARE.md#2-configure-authentication-and-secrets";

type AuthConfigErrorCardProps = {
  message: string;
  onRetry?: () => void;
};

export function AuthConfigErrorCard({
  message,
  onRetry,
}: AuthConfigErrorCardProps) {
  const isHostedMode = isHostedClientAuthMode();

  return (
    <Card className="w-full max-w-2xl shadow-xl">
      <CardContent className="pt-6 gap-4">
        <CardTitle className="gap-2">
          <ShieldAlert className="size-5 text-destructive" />
          Authentication setup required
        </CardTitle>

        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>

        {isHostedMode ? (
          <p className="text-sm text-muted-foreground">
            Hosted mode requires{" "}
            <code className="mx-1">BETTER_AUTH_SECRET</code>
            (32+ characters), <code className="mx-1">BETTER_AUTH_URL</code>, and
            Google OAuth credentials on the deployment.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Cloudflare Access mode requires
            <code className="mx-1">TEAM_DOMAIN</code> (a full https URL) and
            <code className="mx-1">POLICY_AUD</code> set on the deployment, with
            an Access application protecting this hostname.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {onRetry ? (
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try Again
            </Button>
          ) : null}
          <a
            className={buttonVariants({ size: "sm" })}
            href={CLOUDFLARE_SETUP_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Setup Guide
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
