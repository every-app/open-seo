import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AuthPageCard,
  authRedirectSearchSchema,
  getAuthLinkSearch,
  useAuthPageState,
} from "@/client/features/auth/AuthPage";
import { authClient } from "@/lib/auth-client";
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
    return "Sign-in is only available when AUTH_MODE=hosted.";
  }

  return "Sign in to your OpenSEO account.";
}

function getSignInValidationErrors(value: { email: string; password: string }) {
  const parsed = signInSchema.safeParse(value);

  if (parsed.success) {
    return null;
  }

  return {
    form: parsed.error.issues[0]?.message || "Unable to sign in.",
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

function SignInPage() {
  const search = Route.useSearch();
  const { redirectTo, isHostedMode, isSessionPending } = useAuthPageState(
    search.redirect,
  );
  const helperText = getHelperText(isHostedMode);
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: ({ value }) => getSignInValidationErrors(value),
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        const result = await authClient.signIn.email({
          email: value.email.trim(),
          password: value.password,
          callbackURL: redirectTo,
        });

        if (result.error) {
          formApi.setErrorMap({
            onSubmit: result.error.message || "Unable to sign in.",
          });
        }
      } catch {
        formApi.setErrorMap({
          onSubmit: "Unable to sign in right now. Please try again.",
        });
      }
    },
  });

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
              search={getAuthLinkSearch(redirectTo)}
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
            {(field) => (
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
                {field.state.meta.errors[0] ? (
                  <p className="mt-1 text-sm text-error">
                    {field.state.meta.errors[0]}
                  </p>
                ) : null}
              </>
            )}
          </form.Field>
        </label>

        <label className="form-control block">
          <span className="label-text text-sm font-medium">Password</span>
          <form.Field name="password">
            {(field) => (
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
                {field.state.meta.errors[0] ? (
                  <p className="mt-1 text-sm text-error">
                    {field.state.meta.errors[0]}
                  </p>
                ) : null}
              </>
            )}
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
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </>
          )}
        </form.Subscribe>
      </form>
    </AuthPageCard>
  );
}
