import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  AuthPageCard,
  authRedirectSearchSchema,
  getFieldError,
  getFormError,
  useAuthPageState,
} from "@/client/features/auth/AuthPage";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";
import { getSignInSearch } from "@/lib/auth-redirect";
import { z } from "zod";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const Route = createFileRoute("/_auth/sign-in")({
  validateSearch: authRedirectSearchSchema,
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const { redirectTo, oauthQuery, isHostedMode } = useAuthPageState(
    search.redirect,
  );
  const authCallbackURL = redirectTo;
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signInSchema,
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        const email = value.email.trim();
        captureClientEvent("auth:sign_in_submit", {
          redirect_to: redirectTo,
        });
        setVerificationEmail(null);

        const result = await authClient.signIn.email({
          email,
          password: value.password,
          callbackURL: authCallbackURL,
          ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
        });

        if (!result.error) {
          captureClientEvent("auth:sign_in_success", {
            redirect_to: redirectTo,
          });
          return;
        }

        if (result.error.status === 403) {
          captureClientEvent("auth:sign_in_block_unverified", {
            redirect_to: redirectTo,
          });
          setVerificationEmail(email);
          formApi.setErrorMap({
            onSubmit: {
              form: "Please confirm your email before signing in.",
              fields: {},
            },
          });
          return;
        }

        formApi.setErrorMap({
          onSubmit: {
            form: result.error.message || "We couldn't sign you in.",
            fields: {},
          },
        });
      } catch {
        formApi.setErrorMap({
          onSubmit: {
            form: "Unable to sign in right now. Please try again.",
            fields: {},
          },
        });
      }
    },
  });

  async function handleResendVerification() {
    if (!verificationEmail) {
      return;
    }

    setIsSendingVerification(true);

    try {
      const verificationCallbackURL = new URL(
        "/verify-email",
        window.location.origin,
      );
      if (authCallbackURL !== "/") {
        verificationCallbackURL.searchParams.set("redirect", authCallbackURL);
      }
      const result = await authClient.sendVerificationEmail({
        email: verificationEmail,
        callbackURL: verificationCallbackURL.toString(),
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
      setIsSendingVerification(false);
    }
  }

  return (
    <AuthPageCard
      title="Sign in"
      footer={
        isHostedMode ? (
          <div className="flex justify-between text-sm text-base-content/50">
            <Link
              to="/forgot-password"
              search={getSignInSearch(redirectTo)}
              className="text-base-content underline underline-offset-2 hover:text-base-content/80 transition-colors"
            >
              Forgot password?
            </Link>
            <Link
              to="/sign-up"
              search={getSignInSearch(redirectTo)}
              className="text-base-content underline underline-offset-2 hover:text-base-content/80 transition-colors"
            >
              Create account
            </Link>
          </div>
        ) : null
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);

            return (
              <div>
                <input
                  type="email"
                  className="input input-bordered w-full"
                  placeholder="Email address..."
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  autoComplete="email"
                  disabled={!isHostedMode}
                  required
                />
                {error ? (
                  <p className="mt-1 text-sm text-error">{error}</p>
                ) : null}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);

            return (
              <div>
                <input
                  type="password"
                  className="input input-bordered w-full"
                  placeholder="Password..."
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  autoComplete="current-password"
                  disabled={!isHostedMode}
                  required
                />
                {error ? (
                  <p className="mt-1 text-sm text-error">{error}</p>
                ) : null}
              </div>
            );
          }}
        </form.Field>

        {verificationEmail ? (
          <div className="alert alert-warning items-start">
            <div className="space-y-3">
              <p className="text-sm">
                Please check {verificationEmail} for a link to confirm your
                email.
              </p>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  void handleResendVerification();
                }}
                disabled={isSendingVerification}
              >
                {isSendingVerification
                  ? "Sending email..."
                  : "Send another email"}
              </button>
            </div>
          </div>
        ) : null}

        <form.Subscribe
          selector={(state) => ({
            submitError: state.errorMap.onSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ submitError, isSubmitting }) => {
            const errorMessage = getFormError(submitError);
            return (
              <>
                {errorMessage ? (
                  <p className="text-sm text-error">{errorMessage}</p>
                ) : null}
                <button
                  className="btn btn-soft w-full"
                  disabled={!isHostedMode || isSubmitting}
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </button>
              </>
            );
          }}
        </form.Subscribe>
      </form>
    </AuthPageCard>
  );
}
