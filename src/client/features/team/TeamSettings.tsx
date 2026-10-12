import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/client/components/PageHeader";
import { PermissionHint } from "@/client/components/PermissionHint";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonCard } from "@/client/components/SkeletonPresets";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCard,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  InviteTeammateModal,
  inviteErrorMessage,
} from "@/client/features/team/InviteTeammateModal";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import {
  InvitationRow,
  MemberRow,
  type Member,
} from "@/client/features/team/TeamTableRows";
import { TransferOwnershipModal } from "@/client/features/team/TransferOwnershipModal";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient, useSession } from "@/lib/auth-client";
import { hasOrgPermission } from "@/lib/org-permissions";
import { getTeam, sendTeamInvitation } from "@/serverFunctions/organization";

const RESEND_KEY = ["team", "resend-invitation"];
const REMOVE_KEY = ["team", "remove-member"];
const CANCEL_KEY = ["team", "cancel-invitation"];

// Every in-flight call for one action, so each row stays disabled while its
// own request runs even when another row starts the same action.
function usePendingVariables(mutationKey: string[]) {
  return useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => mutation.state.variables,
  });
}

// The Organization tab of account settings: who has access to the active org.
export function TeamSettings() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);

  const orgContextQuery = useQuery(organizationContextQueryOptions());

  const teamQuery = useQuery({
    queryKey: ["organization-team", orgContextQuery.data?.organizationId],
    queryFn: () => getTeam(),
    enabled: orgContextQuery.data?.organizationId !== undefined,
  });

  const refreshTeam = () =>
    queryClient.invalidateQueries({
      queryKey: ["organization-team", orgContextQuery.data?.organizationId],
    });

  // Same server call as inviting: for an already-pending address it re-mails
  // the same link with a refreshed expiry.
  const resendMutation = useMutation({
    mutationKey: RESEND_KEY,
    mutationFn: (email: string) => sendTeamInvitation({ data: { email } }),
    onSuccess: () => {
      captureClientEvent("team:invitation_resend");
      toast.success("Invitation resent");
      void refreshTeam();
    },
    onError: (error: Error) => {
      toast.error(inviteErrorMessage(error));
    },
  });

  const removeMemberMutation = useMutation({
    mutationKey: REMOVE_KEY,
    mutationFn: async (memberId: string) => {
      const result = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to remove the member");
      }
    },
    onSuccess: () => {
      captureClientEvent("team:member_remove");
      toast.success("Member removed");
      void refreshTeam();
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationKey: CANCEL_KEY,
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (result.error) {
        throw new Error(
          result.error.message || "Failed to cancel the invitation",
        );
      }
    },
    onSuccess: () => {
      captureClientEvent("team:invitation_cancel");
      toast.success("Invitation canceled");
      void refreshTeam();
    },
  });

  const pendingResends = usePendingVariables(RESEND_KEY);
  const pendingRemovals = usePendingVariables(REMOVE_KEY);
  const pendingCancels = usePendingVariables(CANCEL_KEY);

  const role = orgContextQuery.data?.role ?? "member";
  const canManageTeam = hasOrgPermission(role, { invitation: ["create"] });
  // billing:manage is the owner-only statement (organization:delete is
  // disabled app-wide, so it would read as a dead capability).
  const isOwner = hasOrgPermission(role, { billing: ["manage"] });

  const members = teamQuery.data?.members ?? [];
  const pendingInvitations = teamQuery.data?.pendingInvitations ?? [];

  // The team query waits on the org context, so a failed context would
  // otherwise leave the team spinner up for good. A failed refetch keeps the
  // loaded table, with the error above it.
  const failedQuery = [orgContextQuery, teamQuery].find(
    (query) => query.isError,
  );
  const loadError = failedQuery ? (
    <QueryError
      error={failedQuery.error}
      fallback="We couldn't load your team right now."
      onRetry={() => void failedQuery.refetch()}
      isRetrying={failedQuery.isFetching}
    />
  ) : null;
  if (failedQuery && failedQuery.data === undefined) return loadError;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Members"
        action={
          canManageTeam ? (
            <Button size="sm" onClick={() => setIsInviteOpen(true)}>
              Invite teammate
            </Button>
          ) : null
        }
      />
      <p className="text-sm text-muted-foreground">
        Teammates join as Admins. Admins have full access to each project except
        for billing.
      </p>
      {orgContextQuery.isSuccess && !canManageTeam ? (
        <PermissionHint action="invite or remove teammates" />
      ) : null}
      {loadError}

      {teamQuery.isPending ? (
        <SkeletonCard />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isSelf={member.userId === session?.user?.id}
                  canManageTeam={canManageTeam}
                  isOwner={isOwner}
                  isRemoving={pendingRemovals.includes(member.id)}
                  onRemove={() => removeMemberMutation.mutate(member.id)}
                  onTransferOwnership={() => setTransferTarget(member)}
                />
              ))}
              {pendingInvitations.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  canManageTeam={canManageTeam}
                  isResending={pendingResends.includes(invitation.email)}
                  isCanceling={pendingCancels.includes(invitation.id)}
                  onResend={() => resendMutation.mutate(invitation.email)}
                  onCancel={() =>
                    cancelInvitationMutation.mutate(invitation.id)
                  }
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {transferTarget ? (
        <TransferOwnershipModal
          member={transferTarget}
          onClose={() => setTransferTarget(null)}
          onTransferred={() => {
            // The caller's own role changed too: refresh the org context that
            // gates the team and billing UI, not only the member list.
            void refreshTeam();
            void queryClient.invalidateQueries({
              queryKey: organizationContextQueryOptions().queryKey,
            });
          }}
        />
      ) : null}

      {isInviteOpen ? (
        <InviteTeammateModal
          onClose={() => setIsInviteOpen(false)}
          onInvited={() => void refreshTeam()}
        />
      ) : null}
    </section>
  );
}
