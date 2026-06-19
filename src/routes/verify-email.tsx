import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AuthPageCard,
  AuthPageShell,
  authRedirectSearchSchema,
} from "@/client/features/auth/AuthPage";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient, useSession } from "@/lib/auth-client";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";
import { getSignInSearch, normalizeAuthRedirect } from "@/lib/auth-redirect";
import { z } from "zod";

const verificationIssueSchema = z
  .enum(["invalid_token", "token_expired", "user_not_found", "unknown"])
  .catch("unknown");

const verifyEmailSearchSchema = authRedirectSearchSchema.extend({
  error: z.string().optional(),
  email: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  component: VerifyEmailPage,
});

function getVerificationErrorMessage(error: string | undefined) {
  switch ((error ?? "").toLowerCase()) {
    case "invalid_token":
      return "This link is no longer valid. Request a new email to keep going.";
    case "token_expired":
      return "This link has expired. Request a new email to keep going.";
    case "user_not_found":
      return "We couldn't find this account anymore. Try creating it again.";
    default:
      return error
        ? "We couldn't confirm this email. Request a new email and try again."
        : null;
  }
}

function getVerifyEmailPageCopy({
  isHostedMode,
  errorMessage,
  isWaiting,
  isPending,
  isVerified,
  email,
}: {
  isHostedMode: boolean;
  errorMessage: string | null;
  isWaiting: boolean;
  isPending: boolean;
  isVerified: boolean;
  email: string | undefined;
}) {
  if (!isHostedMode) {
    return {
      title: "Verify email",
      helperText: "Email confirmation isn't available right now.",
    };
  }

  if (errorMessage) {
    return {
      title: "We couldn't confirm your email",
      helperText: errorMessage,
    };
  }

  if (isWaiting) {
    return {
      title: "Verify your email",
      helperText: email
        ? `Click the link we sent to ${email} to verify your email.`
        : "Check your inbox for the link to verify your email.",
    };
  }

  if (isPending) {
    return {
      title: "Verify email",
      helperText: "Checking your email confirmation.",
    };
  }

  if (isVerified) {
    return {
      title: "Email confirmed",
      helperText: "You're all set. Taking you to your account now.",
    };
  }

  return {
    title: "Sign in to continue",
    helperText: "Sign in to continue to your account.",
  };
}

function VerifyEmailPage() {
  const search = Route.useSearch();
  const redirectTo = normalizeAuthRedirect(search.redirect);
  const isHostedMode = isHostedClientAuthMode();
  const { data: session, isPending } = useSession();
  const bypassEmailVerification = isEmailVerificationBypassed();
  const errorMessage = getVerificationErrorMessage(search.error);
  const verificationIssueType = search.error
    ? verificationIssueSchema.parse(search.error)
    : null;
  const email = search.email ?? session?.user?.email;
  const isVerified = !!session?.user?.emailVerified;
  const [isResending, setIsResending] = useState(false);
  // A hosted user who still needs to verify must see the resend / "check your
  // inbox" state — never a sign-in CTA, which the verification gate would
  // immediately block (the email-verify trap). Keying off `email` (which the
  // sign-up flow always passes) covers the just-signed-up case even while the
  // session is still resolving, so we never flash the sign-in fallback.
  const isWaiting =
    isHostedMode &&
    !errorMessage &&
    !bypassEmailVerification &&
    !isVerified &&
    (Boolean(email) || !isPending);
  const pageCopy = getVerifyEmailPageCopy({
    isHostedMode,
    errorMessage,
    isWaiting,
    isPending,
    isVerified,
    email,
  });

  useEffect(() => {
    if (
      isPending ||
      (!isVerified && !(bypassEmailVerification && session?.user?.id))
    ) {
      return;
    }

    if (isVerified) {
      captureClientEvent("auth:verification_success", {
        redirect_to: redirectTo,
      });
    }

    // Full page reload instead of client-side navigation: the auth→app
    // transition needs a clean server-side load so that all server function
    // handlers are freshly registered (client-side nav during Vite HMR can
    // hit the server before updated handlers are ready, causing
    // "action is not a function" errors).
    window.location.replace(redirectTo);
  }, [
    bypassEmailVerification,
    isPending,
    isVerified,
    redirectTo,
    session?.user?.id,
  ]);

  useEffect(() => {
    if (!verificationIssueType) {
      return;
    }

    captureClientEvent("auth:verification_issue", {
      issue_type: verificationIssueType,
    });
  }, [verificationIssueType]);

  async function handleResend() {
    if (!email) return;
    setIsResending(true);
    try {
      const callbackURL = new URL("/verify-email", window.location.origin);
      if (redirectTo !== "/")
        callbackURL.searchParams.set("redirect", redirectTo);
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: callbackURL.toString(),
      });
      if (result.error) {
        toast.error(result.error.message || "We couldn't send another email.");
        return;
      }
      captureClientEvent("auth:verification_resend");
      toast.success("A new email is on the way.");
    } catch {
      toast.error(
        "We couldn't send another email right now. Please try again.",
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthPageShell>
      <AuthPageCard
        title={pageCopy.title}
        helperText={pageCopy.helperText}
        footer={
          <p className="text-sm">
            <Link
              to="/sign-in"
              search={getSignInSearch(redirectTo)}
              className="text-base-content/50 hover:text-base-content transition-colors"
            >
              Back to sign in
            </Link>
          </p>
        }
      >
        {!isHostedMode ? null : errorMessage ? (
          <div className="space-y-3">
            <div className="alert alert-error">
              <span>{errorMessage}</span>
            </div>
            <Link
              to="/sign-in"
              search={getSignInSearch(redirectTo)}
              className="btn btn-soft w-full"
            >
              Back to sign in
            </Link>
          </div>
        ) : isWaiting ? (
          email ? (
            <div className="space-y-4">
              <button
                type="button"
                className="btn btn-soft w-full"
                onClick={() => void handleResend()}
                disabled={isResending}
              >
                {isResending ? "Sending email..." : "Resend email"}
              </button>
            </div>
          ) : null
        ) : isPending || isVerified ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : (
          <Link
            to="/sign-in"
            search={getSignInSearch(redirectTo)}
            className="btn btn-soft w-full"
          >
            Sign in to continue
          </Link>
        )}
      </AuthPageCard>
    </AuthPageShell>
  );
}
