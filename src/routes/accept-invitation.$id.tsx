import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/client/components/Spinner";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { AuthPageCard, AuthPageShell } from "@/client/features/auth/AuthPage";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient, signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute("/accept-invitation/$id")({
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { id } = Route.useParams();
  const { data: session, isPending: isSessionPending } = useSession();

  return (
    <AuthPageShell>
      {isSessionPending ? (
        <Spinner />
      ) : session?.user ? (
        <InvitationCard invitationId={id} userEmail={session.user.email} />
      ) : (
        <SignedOutInvitationCard invitationId={id} />
      )}
    </AuthPageShell>
  );
}

// getInvitation requires a session matching the invited email, so a
// logged-out visitor gets a generic shell — no invitation details are
// exposed pre-auth by design.
function SignedOutInvitationCard({ invitationId }: { invitationId: string }) {
  const redirect = `/accept-invitation/${invitationId}`;

  return (
    <AuthPageCard title="You&rsquo;re invited">
      <p className="text-sm text-muted-foreground">
        You&rsquo;ve been invited to join an organization on OpenSEO. Sign in
        with the email address that received the invitation to accept it.
      </p>
      <div className="space-y-2">
        <Button
          nativeButton={false}
          render={<Link to="/sign-up" search={{ redirect }} />}
          variant="secondary"
          className="w-full"
        >
          Create account
        </Button>
        <Button
          nativeButton={false}
          render={<Link to="/sign-in" search={{ redirect }} />}
          variant="ghost"
          className="w-full"
        >
          Sign in
        </Button>
      </div>
    </AuthPageCard>
  );
}

function InvitationCard({
  invitationId,
  userEmail,
}: {
  invitationId: string;
  userEmail: string;
}) {
  const [pendingAction, setPendingAction] = useState<
    "accept" | "decline" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  const invitationQuery = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: async () => {
      const result = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });
      if (result.error) {
        throw new Error(result.error.message || "Invitation not found");
      }
      return result.data;
    },
    retry: false,
  });

  async function handleAccept() {
    setActionError(null);
    setPendingAction("accept");
    try {
      const accepted = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (accepted.error) {
        setActionError(
          accepted.error.message || "We couldn't accept the invitation.",
        );
        setPendingAction(null);
        return;
      }

      // Accepting updates the session row but not the session cookie cache;
      // setActive refreshes the cookie so the app opens in the joined org
      // immediately instead of after the cache expires.
      await authClient.organization.setActive({
        organizationId: accepted.data.invitation.organizationId,
      });
      captureClientEvent("team:invitation_accept");
      // Full navigation: every cached query in this tab belongs to the old
      // workspace.
      window.location.assign("/");
    } catch {
      setActionError("We couldn't accept the invitation. Please try again.");
      setPendingAction(null);
    }
  }

  async function handleDecline() {
    setActionError(null);
    setPendingAction("decline");
    try {
      const result = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (result.error) {
        setActionError(
          result.error.message || "We couldn't decline the invitation.",
        );
        setPendingAction(null);
        return;
      }
      captureClientEvent("team:invitation_decline");
      setDeclined(true);
    } catch {
      setActionError("We couldn't decline the invitation. Please try again.");
      setPendingAction(null);
    }
  }

  if (invitationQuery.isPending) {
    return (
      <AuthPageCard title="Checking invitation...">
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </AuthPageCard>
    );
  }

  if (invitationQuery.isError) {
    return (
      <AuthPageCard title="Invitation unavailable">
        <p className="text-sm text-muted-foreground">
          This invitation may have expired, been canceled, or belong to a
          different email address. You&rsquo;re signed in as{" "}
          <span className="font-medium" data-ph-mask>
            {userEmail}
          </span>
          .
        </p>
        <p className="text-sm text-muted-foreground">
          If the invitation was sent to another address, sign out and sign back
          in with that email. Otherwise ask your teammate to send a new invite.
        </p>
        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              // Signs out, then lands on sign-in with a redirect back to this
              // invitation (staying signed in would bounce straight back here).
              signOutAndRedirect();
            }}
          >
            Use a different account
          </Button>
          <Button
            nativeButton={false}
            render={<Link to="/" />}
            variant="ghost"
            className="w-full"
          >
            Go to dashboard
          </Button>
        </div>
      </AuthPageCard>
    );
  }

  if (declined) {
    return (
      <AuthPageCard title="Invitation declined">
        <p className="text-sm text-muted-foreground">
          You declined the invitation to join{" "}
          <span className="font-medium">
            {invitationQuery.data.organizationName}
          </span>
          .
        </p>
        <Button
          nativeButton={false}
          render={<Link to="/" />}
          variant="ghost"
          className="w-full"
        >
          Go to dashboard
        </Button>
      </AuthPageCard>
    );
  }

  return (
    <AuthPageCard title="Join organization">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium" data-ph-mask>
          {invitationQuery.data.inviterEmail}
        </span>{" "}
        invited you to join{" "}
        <span className="font-medium">
          {invitationQuery.data.organizationName}
        </span>{" "}
        on OpenSEO.
      </p>
      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          pending={pendingAction === "accept"}
          disabled={pendingAction !== null}
          onClick={() => void handleAccept()}
        >
          {pendingAction === "accept" ? "Joining..." : "Accept invitation"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          pending={pendingAction === "decline"}
          disabled={pendingAction !== null}
          onClick={() => void handleDecline()}
        >
          {pendingAction === "decline" ? "Declining..." : "Decline"}
        </Button>
      </div>
    </AuthPageCard>
  );
}
