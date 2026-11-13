import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { AuthPageCard, AuthPageShell } from "@/client/features/auth/AuthPage";
import { clearLastProjectId } from "@/client/lib/active-project";
import { pageHead } from "@/client/lib/pageHead";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStripeProjectsLoginAccount } from "@/serverFunctions/stripe-projects";

const loginResultSchema = z.object({ path: z.string() });

/**
 * Where `stripe projects open openseo` lands. Signing in takes a click on a
 * page that names the account, so a link someone else sent can't quietly sign
 * the visitor in to that person's account.
 */
export const Route = createFileRoute("/stripe-projects/login")({
  head: () => pageHead("Sign in"),
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) throw notFound();
  },
  validateSearch: z.object({ token: z.string().optional() }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }) =>
    deps.token
      ? getStripeProjectsLoginAccount({ data: { token: deps.token } })
      : null,
  component: StripeProjectsLoginPage,
});

function StripeProjectsLoginPage() {
  const account = Route.useLoaderData();
  const { token } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    const result = await authClient.$fetch("/stripe-projects/login", {
      method: "POST",
      body: { token },
    });
    const login = loginResultSchema.safeParse(result.data);
    if (!login.success) {
      setFailed(true);
      setPending(false);
      return;
    }
    // Full navigation: cached queries and the remembered project may belong
    // to another account that was signed in here.
    clearLastProjectId();
    window.location.assign(login.data.path);
  }

  if (!account || failed) {
    return (
      <AuthPageShell>
        <AuthPageCard
          title="This link has expired"
          helperText="Sign-in links work once and last ten minutes."
        >
          <Alert>
            <AlertDescription>
              Run <code>stripe projects open openseo</code> again for a new one.
            </AlertDescription>
          </Alert>
          <Button
            nativeButton={false}
            render={<Link to="/sign-in" />}
            variant="secondary"
            className="w-full"
          >
            Sign in another way
          </Button>
        </AuthPageCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthPageCard
        title="Sign in to OpenSEO"
        helperText={`You opened this from Stripe Projects. You'll be signed in as ${account.email}.`}
      >
        <Button className="w-full" disabled={pending} onClick={signIn}>
          Continue as {account.email}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Not your account? Close this page.
        </p>
      </AuthPageCard>
    </AuthPageShell>
  );
}
