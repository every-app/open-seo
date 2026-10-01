import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  AuthPageCard,
  AuthMethodChooser,
  authInputClassName,
  authSubmitClassName,
  authRedirectSearchSchema,
  useAuthPageState,
} from "@/client/features/auth/AuthPage";
import {
  TURNSTILE_SITE_KEY,
  TurnstileWidget,
  useTurnstileCaptcha,
} from "@/client/features/auth/TurnstileWidget";
import { passwordSchema } from "@/client/features/auth/passwordSchema";
import { useGoogleAuth } from "@/client/features/auth/useGoogleAuth";
import { appPath } from "@/shared/app-path";
import { getFormError } from "@/client/lib/forms";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";
import { getSignInSearch, getVerifyEmailSearch } from "@/lib/auth-redirect";
import { z } from "zod";

const signUpSchema = z
  .object({
    name: z.string().trim(),
    email: z.string().trim().email("Enter a valid email address."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const Route = createFileRoute("/_auth/sign-up")({
  validateSearch: authRedirectSearchSchema,
  component: SignUpPage,
});

function SignUpPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { redirectTo, isHostedMode } = useAuthPageState(search.redirect);
  const postSignupRedirect =
    redirectTo === appPath("/") ? appPath("/onboarding") : redirectTo;
  const [showEmailForm, setShowEmailForm] = useState(false);
  const google = useGoogleAuth({ redirectTo, postSignupRedirect });

  // Turnstile is active only in hosted mode with a configured site key.
  const isTurnstileEnabled = isHostedMode && Boolean(TURNSTILE_SITE_KEY);
  const captcha = useTurnstileCaptcha();

  const form = useAppForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ formApi, value }) => {
      const captchaToken = captcha.tokenRef.current;
      try {
        const email = value.email.trim();
        captureClientEvent("auth:sign_up_submit", {
          redirect_to: redirectTo,
        });
        const resolvedName =
          value.name.trim() || email.split("@")[0] || "OpenSEO User";
        const verificationCallbackURL = new URL(
          "/verify-email",
          window.location.origin,
        );
        const verificationSearch = getVerifyEmailSearch(
          undefined,
          postSignupRedirect,
        );
        if (verificationSearch.redirect) {
          verificationCallbackURL.searchParams.set(
            "redirect",
            verificationSearch.redirect,
          );
        }
        const result = await authClient.signUp.email({
          name: resolvedName,
          email,
          password: value.password,
          callbackURL: verificationCallbackURL.toString(),
          ...(isTurnstileEnabled && captchaToken
            ? {
                fetchOptions: {
                  headers: { "x-captcha-response": captchaToken },
                },
              }
            : {}),
        });

        if (result.error) {
          // Turnstile tokens are single-use; re-challenge so a retry can succeed.
          if (isTurnstileEnabled) captcha.reset();
          formApi.setErrorMap({
            onSubmit: {
              form: result.error.message || "Unable to create account.",
              fields: {},
            },
          });
          return;
        }

        captureClientEvent("auth:sign_up_success", {
          redirect_to: redirectTo,
        });
        void navigate({
          to: "/verify-email",
          search: getVerifyEmailSearch(email, postSignupRedirect),
          replace: true,
        });
      } catch {
        if (isTurnstileEnabled) captcha.reset();
        formApi.setErrorMap({
          onSubmit: {
            form: "Unable to create account right now. Please try again.",
            fields: {},
          },
        });
      }
    },
  });

  return (
    <AuthPageCard
      title="Create your account"
      footer={
        isHostedMode ? (
          showEmailForm ? (
            <button
              type="button"
              className="text-sm text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
              onClick={() => {
                setShowEmailForm(false);
                google.clearError();
              }}
            >
              Back to signup
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                By signing up, you agree to our{" "}
                <a
                  href="https://openseo.so/terms-and-conditions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="https://openseo.so/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
                >
                  Privacy Policy
                </a>
                .
              </p>

              <p className="text-sm text-foreground/50">
                Already have an account?{" "}
                <Link
                  to="/sign-in"
                  search={getSignInSearch(redirectTo)}
                  className="text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </div>
          )
        ) : null
      }
    >
      {!showEmailForm ? (
        <>
          <AuthMethodChooser
            googleLabel="Continue with Google"
            disabled={!isHostedMode}
            isBusy={google.isStarting}
            onContinueWithGoogle={() => {
              void google.start();
            }}
            onContinueWithEmail={() => {
              setShowEmailForm(true);
              google.clearError();
            }}
          />
          {google.error ? (
            <p className="text-sm text-destructive">{google.error}</p>
          ) : null}
        </>
      ) : (
        <form.AppForm>
          <form.Form className="space-y-4">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Name (optional)"
                  hideLabel
                  className={authInputClassName}
                  placeholder="Name (optional)..."
                  autoComplete="name"
                />
              )}
            </form.AppField>
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  label="Email address"
                  hideLabel
                  className={authInputClassName}
                  type="email"
                  placeholder="Email address..."
                  autoComplete="email"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.TextField
                  label="Password"
                  hideLabel
                  className={authInputClassName}
                  type="password"
                  placeholder="Password..."
                  autoComplete="new-password"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => (
                <field.TextField
                  label="Confirm password"
                  hideLabel
                  className={authInputClassName}
                  type="password"
                  placeholder="Confirm password..."
                  autoComplete="new-password"
                  required
                />
              )}
            </form.AppField>

            {isTurnstileEnabled ? (
              <TurnstileWidget
                onToken={captcha.onToken}
                resetNonce={captcha.resetNonce}
              />
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
                      <p className="text-sm text-destructive">{errorMessage}</p>
                    ) : null}
                    <Button
                      type="submit"
                      variant="secondary"
                      className={authSubmitClassName}
                      pending={isSubmitting}
                      disabled={isTurnstileEnabled && !captcha.hasToken}
                    >
                      {isSubmitting ? "Creating account..." : "Create account"}
                    </Button>
                  </>
                );
              }}
            </form.Subscribe>
          </form.Form>
        </form.AppForm>
      )}
    </AuthPageCard>
  );
}
