import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/client/components/ui/button";
import { AuthPageCard, AuthPageShell } from "@/client/features/auth/AuthPage";
import { googleAuthErrorCopy } from "@/client/features/integrations/googleAuthErrorCopy";

const authErrorSearchSchema = z.object({
  error: z.string().optional(),
});

export const Route = createFileRoute("/auth-error")({
  validateSearch: authErrorSearchSchema,
  component: AuthErrorPage,
});

/**
 * Landing page for OAuth failures that can't be routed back to the page that
 * started the flow: Better Auth sign-in failures (wired via
 * `onAPIError.errorURL` in auth.ts) and Search Console / Analytics callbacks
 * whose state can't be verified (googleOAuth.ts). Link failures that can be
 * attributed to a specific flow return to the connect surface instead.
 */
function AuthErrorPage() {
  const { error } = Route.useSearch();
  const copy = googleAuthErrorCopy(error ?? "unknown");

  return (
    <AuthPageShell>
      <AuthPageCard
        title={copy.title}
        helperText={copy.description}
        footer={
          error ? (
            <p className="font-mono text-xs text-muted-foreground">
              Code: {error}
            </p>
          ) : undefined
        }
      >
        <Button
          nativeButton={false}
          render={<Link to="/" />}
          variant="secondary"
          className="w-full"
        >
          Back to OpenSEO
        </Button>
      </AuthPageCard>
    </AuthPageShell>
  );
}
