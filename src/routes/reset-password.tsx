import { Link, createFileRoute } from "@tanstack/react-router";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  AuthPageCard,
  AuthPageShell,
  authRedirectSearchSchema,
} from "@/client/features/auth/AuthPage";
import { passwordSchema } from "@/client/features/auth/passwordSchema";
import { getFormError } from "@/client/lib/forms";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getSignInSearch, normalizeAuthRedirect } from "@/lib/auth-redirect";
import { z } from "zod";

const resetPasswordSchema = z
  .object({
    password: passwordSchema,
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
  const token = search.token;
  const form = useAppForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: resetPasswordSchema,
    },
    // The form only renders when the URL carries a token.
    onSubmit: async ({ formApi, value }) => {
      try {
        const result = await authClient.resetPassword({
          newPassword: value.password,
          token,
        });

        if (result.error) {
          formApi.setErrorMap({
            onSubmit: {
              form:
                result.error.code === "INVALID_TOKEN" || !result.error.message
                  ? "This reset link is no longer valid. Request a new one and try again."
                  : result.error.message,
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
                isComplete ? undefined : (
                  <p className="text-sm">
                    <Link
                      to="/sign-in"
                      search={getSignInSearch(redirectTo)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Sign in
                    </Link>
                  </p>
                )
              }
            >
              {!isHostedMode ? null : isComplete ? (
                <Button
                  nativeButton={false}
                  variant="secondary"
                  className="w-full"
                  render={
                    <Link to="/sign-in" search={getSignInSearch(redirectTo)} />
                  }
                >
                  Continue to sign in
                </Button>
              ) : routeError || !token ? (
                <Button
                  nativeButton={false}
                  variant="secondary"
                  className="w-full"
                  render={
                    <Link
                      to="/forgot-password"
                      search={getSignInSearch(redirectTo)}
                    />
                  }
                >
                  Request a new reset link
                </Button>
              ) : (
                <form.AppForm>
                  <form.Form className="space-y-4">
                    <form.AppField name="password">
                      {(field) => (
                        <field.TextField
                          label="New password"
                          type="password"
                          placeholder="New password..."
                          autoComplete="new-password"
                          required
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="confirmPassword">
                      {(field) => (
                        <field.TextField
                          label="Confirm new password"
                          type="password"
                          placeholder="Confirm new password..."
                          autoComplete="new-password"
                          required
                        />
                      )}
                    </form.AppField>

                    {errorMessage ? (
                      <Alert variant="destructive">
                        <AlertDescription>{errorMessage}</AlertDescription>
                      </Alert>
                    ) : null}
                    <Button
                      type="submit"
                      variant="secondary"
                      className="w-full"
                      pending={isSubmitting}
                    >
                      {isSubmitting
                        ? "Updating password..."
                        : "Update password"}
                    </Button>
                  </form.Form>
                </form.AppForm>
              )}
            </AuthPageCard>
          );
        }}
      </form.Subscribe>
    </AuthPageShell>
  );
}
