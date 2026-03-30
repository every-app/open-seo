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

function getHelperText(isHostedMode: boolean) {
  if (!isHostedMode) {
    return "Sign-in isn't available right now.";
  }

  return "Sign in to your OpenSEO account.";
}

function SignInPage() {
  const search = Route.useSearch();
  const { redirectTo, isHostedMode, isSessionPending } = useAuthPageState(
    search.redirect,
  );
  const helperText = getHelperText(isHostedMode);
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
        setVerificationEmail(null);

        const result = await authClient.signIn.email({
          email,
          password: value.password,
          callbackURL: redirectTo,
        });

        if (!result.error) {
          return;
        }

        if (result.error.status === 403) {
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
      const callbackURL = new URL("/verify-email", window.location.origin);
      if (redirectTo !== "/")
        callbackURL.searchParams.set("redirect", redirectTo);
      const result = await authClient.sendVerificationEmail({
        email: verificationEmail,
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
      setIsSendingVerification(false);
    }
  }

  return (
    <AuthPageCard
      title="Sign in"
      helperText={helperText}
      footer={
        isHostedMode ? (
          <p className="text-sm text-base-content/70">
            Need an account?{" "}
            <Link
              to="/sign-up"
              search={getSignInSearch(redirectTo)}
              className="link link-primary"
            >
              Create account
            </Link>
          </p>
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
        <label className="form-control block">
          <span className="label-text text-sm font-medium">Email</span>
          <form.Field name="email">
            {(field) => {
              const error = getFieldError(field.state.meta.errors);

              return (
                <>
                  <input
                    type="email"
                    className="input input-bordered w-full mt-1"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    autoComplete="email"
                    disabled={!isHostedMode || isSessionPending}
                    required
                  />
                  {error ? (
                    <p className="mt-1 text-sm text-error">{error}</p>
                  ) : null}
                </>
              );
            }}
          </form.Field>
        </label>

        <label className="form-control block">
          <span className="label-text text-sm font-medium">Password</span>
          <form.Field name="password">
            {(field) => {
              const error = getFieldError(field.state.meta.errors);

              return (
                <>
                  <input
                    type="password"
                    className="input input-bordered w-full mt-1"
                    placeholder="Enter your password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    autoComplete="current-password"
                    disabled={!isHostedMode || isSessionPending}
                    required
                  />
                  {error ? (
                    <p className="mt-1 text-sm text-error">{error}</p>
                  ) : null}
                </>
              );
            }}
          </form.Field>
        </label>

        <div className="text-right">
          <Link
            to="/forgot-password"
            search={getSignInSearch(redirectTo)}
            className="link link-hover text-sm"
          >
            Forgot password?
          </Link>
        </div>

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
                  className="btn btn-primary w-full"
                  disabled={!isHostedMode || isSessionPending || isSubmitting}
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
