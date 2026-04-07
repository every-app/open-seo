import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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
      try {
        const email = value.email.trim();
        captureClientEvent("auth:sign_up_submit", {
          redirect_to: redirectTo,
        });
        const resolvedName =
          value.name.trim() || email.split("@")[0] || "OpenSEO User";
        const result = await authClient.signUp.email({
          name: resolvedName,
          email,
          password: value.password,
          callbackURL: (() => {
            const url = new URL("/verify-email", window.location.origin);
            if (redirectTo !== "/")
              url.searchParams.set("redirect", redirectTo);
            return url.toString();
          })(),
        });

        if (result.error) {
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
          search: { email, ...getSignInSearch(redirectTo) },
        });
      } catch {
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
                  {isSubmitting ? "Creating account..." : "Create account"}
                </button>
              </>
            );
          }}
        </form.Subscribe>
      </form>
    </AuthPageCard>
  );
}
