import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AuthPageCard,
  AuthPageShell,
  authRedirectSearchSchema,
  getFieldError,
  getFormError,
} from "@/client/features/auth/AuthPage";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getSignInSearch, normalizeAuthRedirect } from "@/lib/auth-redirect";
import {
  HOSTED_PASSWORD_MAX_LENGTH,
  HOSTED_PASSWORD_MIN_LENGTH,
} from "@/lib/auth-options";
import { z } from "zod";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(
        HOSTED_PASSWORD_MIN_LENGTH,
        `Password must be at least ${HOSTED_PASSWORD_MIN_LENGTH} characters.`,
      )
      .max(
        HOSTED_PASSWORD_MAX_LENGTH,
        `Password must be at most ${HOSTED_PASSWORD_MAX_LENGTH} characters.`,
      ),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const resetPasswordSearchSchema = authRedirectSearchSchema.extend({
  error: z.string().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  component: ResetPasswordPage,
});

function getResetPasswordErrorMessage(error: string | undefined) {
  switch ((error ?? "").toLowerCase()) {
    case "invalid_token":
      return "This reset link is no longer valid. Request a new one to keep going.";
    case "token_expired":
      return "This reset link has expired. Request a new one to keep going.";
    default:
      return error
        ? "This reset link can't be used anymore. Request a new one and try again."
        : null;
  }
}

function getResetPasswordPageCopy({
  isHostedMode,
  isComplete,
  routeError,
  hasToken,
}: {
  isHostedMode: boolean;
  isComplete: boolean;
  routeError: string | null;
  hasToken: boolean;
}) {
  if (!isHostedMode) {
    return {
      title: "Reset password",
      helperText: "Password reset isn't available right now.",
    };
  }

  if (isComplete) {
    return {
      title: "Password updated",
      helperText:
        "Your password has been updated. Sign in with your new password.",
    };
  }

  if (routeError || !hasToken) {
    return {
      title: "Reset link expired",
      helperText:
        routeError ||
        "This reset link is no longer valid. Request a new one to keep going.",
    };
  }

  return {
    title: "Reset password",
    helperText: "Choose a new password for your account.",
  };
}

function ResetPasswordPage() {
  const search = Route.useSearch();
  const redirectTo = normalizeAuthRedirect(search.redirect);
  const isHostedMode = isHostedClientAuthMode();
  const routeError = getResetPasswordErrorMessage(search.error);
  const token = typeof search.token === "string" ? search.token : null;
  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: resetPasswordSchema,
    },
    onSubmit: async ({ formApi, value }) => {
      if (!token) {
        formApi.setErrorMap({
          onSubmit: {
            form: "This reset link is no longer valid. Request a new one and try again.",
            fields: {},
          },
        });
        return;
      }

      try {
        const result = await authClient.resetPassword({
          newPassword: value.password,
          token,
        });

        if (result.error) {
          formApi.setErrorMap({
            onSubmit: {
              form: "This reset link is no longer valid. Request a new one and try again.",
              fields: {},
            },
          });
          return;
        }
      } catch {
        formApi.setErrorMap({
          onSubmit: {
            form: "We couldn't update your password right now. Please try again.",
            fields: {},
          },
        });
      }
    },
  });

  return (
    <AuthPageShell>
      <form.Subscribe
        selector={(state) => ({
          isComplete: state.isSubmitSuccessful && !state.errorMap.onSubmit,
          submitError: state.errorMap.onSubmit,
          isSubmitting: state.isSubmitting,
        })}
      >
        {({ isComplete, submitError, isSubmitting }) => {
          const errorMessage = getFormError(submitError);
          const pageCopy = getResetPasswordPageCopy({
            isHostedMode,
            isComplete,
            routeError,
            hasToken: !!token,
          });

          return (
            <AuthPageCard
              title={pageCopy.title}
              helperText={pageCopy.helperText}
              footer={
                <p className="text-sm text-base-content/70">
                  Back to{" "}
                  <Link
                    to="/sign-in"
                    search={getSignInSearch(redirectTo)}
                    className="link link-primary"
                  >
                    sign in
                  </Link>
                </p>
              }
            >
              {!isHostedMode ? null : isComplete ? (
                <a
                  href={
                    redirectTo === "/"
                      ? "/sign-in"
                      : `/sign-in?redirect=${encodeURIComponent(redirectTo)}`
                  }
                  className="btn btn-primary w-full"
                >
                  Continue to sign in
                </a>
              ) : routeError || !token ? (
                <Link
                  to="/forgot-password"
                  search={getSignInSearch(redirectTo)}
                  className="btn btn-primary w-full"
                >
                  Request a new reset link
                </Link>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void form.handleSubmit();
                  }}
                >
                  <label className="form-control block">
                    <span className="label-text text-sm font-medium">
                      New password
                    </span>
                    <form.Field name="password">
                      {(field) => {
                        const error = getFieldError(field.state.meta.errors);

                        return (
                          <>
                            <input
                              type="password"
                              className="input input-bordered w-full mt-1"
                              placeholder="Create a new password"
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              autoComplete="new-password"
                              minLength={HOSTED_PASSWORD_MIN_LENGTH}
                              maxLength={HOSTED_PASSWORD_MAX_LENGTH}
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
                    <span className="label-text text-sm font-medium">
                      Confirm password
                    </span>
                    <form.Field name="confirmPassword">
                      {(field) => {
                        const error = getFieldError(field.state.meta.errors);

                        return (
                          <>
                            <input
                              type="password"
                              className="input input-bordered w-full mt-1"
                              placeholder="Confirm your new password"
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              autoComplete="new-password"
                              minLength={HOSTED_PASSWORD_MIN_LENGTH}
                              maxLength={HOSTED_PASSWORD_MAX_LENGTH}
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

                  {errorMessage ? (
                    <p className="text-sm text-error">{errorMessage}</p>
                  ) : null}
                  <button
                    className="btn btn-primary w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Updating password..." : "Update password"}
                  </button>
                </form>
              )}
            </AuthPageCard>
          );
        }}
      </form.Subscribe>
    </AuthPageShell>
  );
}
