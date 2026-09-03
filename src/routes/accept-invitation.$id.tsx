import { useQuery } from "@tanstack/react-query";
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
      {isSessionPending ? null : session?.user ? (
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
      <p className="text-sm text-base-content/70">
        You&rsquo;ve been invited to join an organization on OpenSEO. Sign in
        with the email address that received the invitation to accept it.
      </p>
      <div className="space-y-2">
        <Link
          to="/sign-up"
          search={{ redirect }}
          className="btn btn-soft w-full"
        >
          Create account
        </Link>
        <Link
          to="/sign-in"
          search={{ redirect }}
          className="btn btn-ghost w-full"
        >
          Sign in
        </Link>
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setIsSubmitting(true);
    try {
      const accepted = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (accepted.error) {
        setActionError(
          accepted.error.message || "We couldn't accept the invitation.",
        );
        setIsSubmitting(false);
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
      setIsSubmitting(false);
    }
  }

  async function handleDecline() {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const result = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (result.error) {
        setActionError(
          result.error.message || "We couldn't decline the invitation.",
        );
        setIsSubmitting(false);
        return;
      }
      captureClientEvent("team:invitation_decline");
      setDeclined(true);
    } catch {
      setActionError("We couldn't decline the invitation. Please try again.");
      setIsSubmitting(false);
    }
  }

  if (invitationQuery.isPending) {
    return (
      <AuthPageCard title="Checking invitation...">
        <div className="flex justify-center py-4">
          <span className="loading loading-spinner loading-md" />
        </div>
      </AuthPageCard>
    );
  }

  if (invitationQuery.isError) {
    return (
      <AuthPageCard title="Invitation unavailable">
        <p className="text-sm text-base-content/70">
          This invitation may have expired, been canceled, or belong to a
          different email address. You&rsquo;re signed in as{" "}
          <span className="font-medium" data-ph-mask>
            {userEmail}
          </span>
          .
        </p>
        <p className="text-sm text-base-content/70">
          If the invitation was sent to another address, sign out and sign back
          in with that email. Otherwise ask your teammate to send a new invite.
        </p>
        <div className="space-y-2">
          <button
            type="button"
            className="btn btn-soft w-full"
            onClick={() => {
              // Signs out, then lands on sign-in with a redirect back to this
              // invitation (staying signed in would bounce straight back here).
              signOutAndRedirect();
            }}
          >
            Use a different account
          </button>
          <Link to="/" className="btn btn-ghost w-full">
            Go to dashboard
          </Link>
        </div>
      </AuthPageCard>
    );
  }

  if (declined) {
    return (
      <AuthPageCard title="Invitation declined">
        <p className="text-sm text-base-content/70">
          You declined the invitation to join{" "}
          <span className="font-medium">
            {invitationQuery.data.organizationName}
          </span>
          .
        </p>
        <Link to="/" className="btn btn-ghost w-full">
          Go to dashboard
        </Link>
      </AuthPageCard>
    );
  }

  return (
    <AuthPageCard title="Join organization">
      <p className="text-sm text-base-content/70">
        <span className="font-medium" data-ph-mask>
          {invitationQuery.data.inviterEmail}
        </span>{" "}
        invited you to join{" "}
        <span className="font-medium">
          {invitationQuery.data.organizationName}
        </span>{" "}
        on OpenSEO.
      </p>
      {actionError ? <p className="text-sm text-error">{actionError}</p> : null}
      <div className="space-y-2">
        <button
          type="button"
          className="btn btn-soft w-full"
          disabled={isSubmitting}
          onClick={() => void handleAccept()}
        >
          {isSubmitting ? "Joining..." : "Accept invitation"}
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full"
          disabled={isSubmitting}
          onClick={() => void handleDecline()}
        >
          Decline
        </button>
      </div>
    </AuthPageCard>
  );
}
