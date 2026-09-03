import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthPageCard, AuthPageShell } from "@/client/features/auth/AuthPage";
import { googleAuthErrorCopy } from "@/client/features/integrations/googleAuthErrorCopy";

const authErrorSearchSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/auth-error")({
  validateSearch: authErrorSearchSchema,
  component: AuthErrorPage,
});

/**
 * Landing page for Better Auth OAuth failures that can't be routed back to the
 * page that started the flow (wired via `onAPIError.errorURL` in auth.ts):
 * Google-side errors like a canceled consent screen, replayed callback URLs,
 * and sign-in failures. Link failures that Better Auth can attribute to a
 * specific flow return to the connect surface instead (see startGoogleLink's
 * errorCallbackURL).
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
            <p className="font-mono text-xs text-base-content/40">
              Code: {error}
            </p>
          ) : undefined
        }
      >
        <Link to="/" className="btn btn-soft w-full">
          Back to OpenSEO
        </Link>
      </AuthPageCard>
    </AuthPageShell>
  );
}
