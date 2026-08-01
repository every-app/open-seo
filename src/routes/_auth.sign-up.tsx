import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  AuthPageCard,
  AuthMethodChooser,
  authRedirectSearchSchema,
  useAuthPageState,
} from "@/client/features/auth/AuthPage";
import {
  TURNSTILE_SITE_KEY,
  TurnstileWidget,
  useTurnstileCaptcha,
} from "@/client/features/auth/TurnstileWidget";
import { getFieldError, getFormError } from "@/client/lib/forms";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";
import { getSignInSearch, getVerifyEmailSearch } from "@/lib/auth-redirect";
import {
  HOSTED_PASSWORD_MAX_LENGTH,
  HOSTED_PASSWORD_MIN_LENGTH,
} from "@/lib/auth-options";
import { z } from "zod";

const signUpSchema = z
  .object({
    name: z.string().trim(),
    email: z.string().trim().email("Enter a valid email address."),
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

export const Route = createFileRoute("/_auth/sign-up")({
  validateSearch: authRedirectSearchSchema,
  component: SignUpPage,
});

function SignUpPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { redirectTo, isHostedMode } = useAuthPageState(search.redirect);
  const postSignupRedirect = redirectTo === "/" ? "/onboarding" : redirectTo;
  const [showEmailForm, setShowEmailForm] = useState(false);
  const google = useGoogleSignUp({ redirectTo, postSignupRedirect });

  // Turnstile is active only in hosted mode with a configured site key.
  const isTurnstileEnabled = isHostedMode && Boolean(TURNSTILE_SITE_KEY);
  const captcha = useTurnstileCaptcha();

  const form = useForm({
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
      if (isTurnstileEnabled && !captchaToken) {
        formApi.setErrorMap({
          onSubmit: {
            form: "Please complete the captcha to continue.",
            fields: {},
          },
        });
        return;
      }
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
              className="text-sm text-base-content underline underline-offset-2 hover:text-base-content/80 transition-colors"
              onClick={() => {
                setShowEmailForm(false);
                google.clearError();
              }}
            >
              Back to signup
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-base-content/60">
                By signing up, you agree to our{" "}
                <a
                  href="https://openseo.so/terms-and-conditions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-base-content underline underline-offset-2 hover:text-base-content/80 transition-colors"
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="https://openseo.so/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-base-content underline underline-offset-2 hover:text-base-content/80 transition-colors"
                >
                  Privacy Policy
                </a>
                .
              </p>

              <p className="text-sm text-base-content/50">
                Already have an account?{" "}
                <Link
                  to="/sign-in"
                  search={getSignInSearch(redirectTo)}
                  className="text-base-content underline underline-offset-2 hover:text-base-content/80 transition-colors"
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
            <p className="text-sm text-error">{google.error}</p>
          ) : null}
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => {
              const error = getFieldError(field.state.meta.errors);

              return (
                <div>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    placeholder="Name (optional)..."
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    autoComplete="name"
                    disabled={!isHostedMode}
                  />
                  {error ? (
                    <p className="mt-1 text-sm text-error">{error}</p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>

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
                    autoComplete="new-password"
                    disabled={!isHostedMode}
                    required
                    minLength={HOSTED_PASSWORD_MIN_LENGTH}
                    maxLength={HOSTED_PASSWORD_MAX_LENGTH}
                  />
                  {error ? (
                    <p className="mt-1 text-sm text-error">{error}</p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => {
              const error = getFieldError(field.state.meta.errors);

              return (
                <div>
                  <input
                    type="password"
                    className="input input-bordered w-full"
                    placeholder="Confirm password..."
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    autoComplete="new-password"
                    disabled={!isHostedMode}
                    required
                    minLength={HOSTED_PASSWORD_MIN_LENGTH}
                    maxLength={HOSTED_PASSWORD_MAX_LENGTH}
                  />
                  {error ? (
                    <p className="mt-1 text-sm text-error">{error}</p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>

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
                    <p className="text-sm text-error">{errorMessage}</p>
                  ) : null}
                  <button
                    className="btn btn-soft w-full"
                    disabled={
                      !isHostedMode ||
                      isSubmitting ||
                      (isTurnstileEnabled && !captcha.hasToken)
                    }
                  >
                    {isSubmitting ? "Creating account..." : "Create account"}
                  </button>
                </>
              );
            }}
          </form.Subscribe>
        </form>
      )}
    </AuthPageCard>
  );
}

// Google sign-up: kicks off the social OAuth redirect and surfaces its error.
function useGoogleSignUp({
  redirectTo,
  postSignupRedirect,
}: {
  redirectTo: string;
  postSignupRedirect: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setIsStarting(true);

    try {
      captureClientEvent("auth:sign_up_google_start", {
        redirect_to: redirectTo,
      });
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: redirectTo,
        newUserCallbackURL: postSignupRedirect,
        requestSignUp: true,
      });

      if (result.error) {
        setError(
          result.error.message || "Google sign up is not available right now.",
        );
        setIsStarting(false);
      }
    } catch {
      setError("Google sign up is not available right now.");
      setIsStarting(false);
    }
  };

  return {
    isStarting,
    error,
    start,
    clearError: () => setError(null),
  };
}
