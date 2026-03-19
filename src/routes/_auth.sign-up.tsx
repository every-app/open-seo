import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AuthPageCard,
  authRedirectSearchSchema,
  getAuthLinkSearch,
  getFieldError,
  useAuthPageState,
} from "@/client/features/auth/AuthPage";
import { authClient } from "@/lib/auth-client";
import {
  HOSTED_PASSWORD_MAX_LENGTH,
  HOSTED_PASSWORD_MIN_LENGTH,
} from "@/lib/auth-options";
import { z } from "zod";

const signUpSchema = z
  .object({
    name: z.string().trim().optional(),
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

type SignUpValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export const Route = createFileRoute("/_auth/sign-up")({
  validateSearch: authRedirectSearchSchema,
  component: SignUpPage,
});

function getHelperText(isHostedMode: boolean) {
  return isHostedMode
    ? "Create your OpenSEO account."
    : "Account creation is only available when AUTH_MODE=hosted.";
}

function getSignUpValidationErrors(value: SignUpValues) {
  const parsed = signUpSchema.safeParse(value);

  if (parsed.success) {
    return null;
  }

  return {
    form:
      parsed.error.issues[0]?.message || "Please check your account details.",
    fields: parsed.error.issues.reduce<Record<string, string>>(
      (errors, issue) => {
        const path = issue.path.join(".");

        if (path && !errors[path]) {
          errors[path] = issue.message;
        }

        return errors;
      },
      {},
    ),
  };
}

function SignUpPage() {
  const search = Route.useSearch();
  const { redirectTo, isHostedMode, isSessionPending } = useAuthPageState(
    search.redirect,
  );
  const helperText = getHelperText(isHostedMode);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: ({ value }) => getSignUpValidationErrors(value),
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        const email = value.email.trim();
        const resolvedName =
          value.name.trim() || email.split("@")[0] || "OpenSEO User";
        const result = await authClient.signUp.email({
          name: resolvedName,
          email,
          password: value.password,
          callbackURL: redirectTo,
        });

        if (result.error) {
          formApi.setErrorMap({
            onSubmit: result.error.message || "Unable to create account.",
          });
        }
      } catch {
        formApi.setErrorMap({
          onSubmit: "Unable to create account right now. Please try again.",
        });
      }
    },
  });

  return (
    <AuthPageCard
      title="Create account"
      helperText={helperText}
      footer={
        isHostedMode ? (
          <p className="text-sm text-base-content/70">
            Already have an account?{" "}
            <Link
              to="/sign-in"
              search={getAuthLinkSearch(redirectTo)}
              className="link link-primary"
            >
              Sign in
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
          <span className="label-text text-sm font-medium">Name</span>
          <form.Field name="name">
            {(field) => {
              const error = getFieldError(field.state.meta.errors);

              return (
                <>
                  <input
                    type="text"
                    className="input input-bordered w-full mt-1"
                    placeholder="Jane Doe (optional)"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    autoComplete="name"
                    disabled={!isHostedMode || isSessionPending}
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
                    placeholder="Create a password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    autoComplete="new-password"
                    disabled={!isHostedMode || isSessionPending}
                    required
                    minLength={HOSTED_PASSWORD_MIN_LENGTH}
                    maxLength={HOSTED_PASSWORD_MAX_LENGTH}
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
                    placeholder="Confirm your password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    autoComplete="new-password"
                    disabled={!isHostedMode || isSessionPending}
                    required
                    minLength={HOSTED_PASSWORD_MIN_LENGTH}
                    maxLength={HOSTED_PASSWORD_MAX_LENGTH}
                  />
                  {error ? (
                    <p className="mt-1 text-sm text-error">{error}</p>
                  ) : null}
                </>
              );
            }}
          </form.Field>
        </label>

        <form.Subscribe
          selector={(state) => ({
            submitError: state.errorMap.onSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ submitError, isSubmitting }) => (
            <>
              {submitError ? (
                <p className="text-sm text-error">{submitError}</p>
              ) : null}
              <button
                className="btn btn-primary w-full"
                disabled={!isHostedMode || isSessionPending || isSubmitting}
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </button>
            </>
          )}
        </form.Subscribe>
      </form>
    </AuthPageCard>
  );
}
