import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AuthPageCard,
  AuthPageShell,
  authRedirectSearchSchema,
} from "@/client/features/auth/AuthPage";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getSignInSearch, normalizeAuthRedirect } from "@/lib/auth-redirect";
import { z } from "zod";

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

  if (isWaiting && email) {
    return {
      title: "Check your email",
      helperText: `We sent a confirmation link to ${email}. Open it to confirm your email.`,
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
    title: "Email confirmed",
    helperText: "Your email is confirmed. You can sign in now.",
  };
}

function VerifyEmailPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const redirectTo = normalizeAuthRedirect(search.redirect);
  const isHostedMode = isHostedClientAuthMode();
  const { data: session, isPending } = useSession();
  const errorMessage = getVerificationErrorMessage(search.error);
  const email = search.email;
  const isWaiting = !errorMessage && !session?.user?.emailVerified && !!email;
  const [isResending, setIsResending] = useState(false);
  const isVerified = !!session?.user?.emailVerified;
  const pageCopy = getVerifyEmailPageCopy({
    isHostedMode,
    errorMessage,
    isWaiting,
    isPending,
    isVerified,
    email,
  });

  useEffect(() => {
    if (!isVerified) {
      return;
    }

    void navigate({ href: redirectTo, replace: true });
  }, [isVerified, navigate, redirectTo]);

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
          <p className="text-sm text-base-content/70">
            Need to sign in instead?{" "}
            <Link
              to="/sign-in"
              search={getSignInSearch(redirectTo)}
              className="link link-primary"
            >
              Open sign in
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
              className="btn btn-primary w-full"
            >
              Back to sign in
            </Link>
          </div>
        ) : isWaiting ? (
          <div className="space-y-4">
            <div className="alert alert-success">
              <span>
                After you click the link in your email, this page will finish up
                automatically.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-outline w-full"
              onClick={() => void handleResend()}
              disabled={isResending}
            >
              {isResending ? "Sending email..." : "Send another email"}
            </button>
          </div>
        ) : isPending ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : isVerified ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : (
          <Link
            to="/sign-in"
            search={getSignInSearch(redirectTo)}
            className="btn btn-primary w-full"
          >
            Sign in to continue
          </Link>
        )}
      </AuthPageCard>
    </AuthPageShell>
  );
}
