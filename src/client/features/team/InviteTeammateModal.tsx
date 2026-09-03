import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getErrorCode } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { sendTeamInvitation } from "@/serverFunctions/organization";

export function inviteErrorMessage(error: Error) {
  const code = getErrorCode(error);
  if (code === "RATE_LIMITED") {
    return "Invitation limit reached for today. Try again tomorrow.";
  }
  if (code === "UPSTREAM_UNAVAILABLE") {
    return "The invitation was saved but the email couldn't be sent. Use Resend in a moment to retry.";
  }
  return "We couldn't send that invitation.";
}

export function InviteTeammateModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");

  // Server function (not authClient.inviteMember): it enforces the daily send
  // limits and fails visibly when the invite email doesn't send.
  const inviteMutation = useMutation({
    mutationFn: (inviteeEmail: string) =>
      sendTeamInvitation({ data: { email: inviteeEmail } }),
    onSuccess: () => {
      captureClientEvent("team:invitation_send");
      toast.success("Invitation sent");
      onInvited();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(inviteErrorMessage(error));
      // An email-send failure still creates the pending row — show it.
      onInvited();
    },
  });

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = email.trim();
            if (trimmed) inviteMutation.mutate(trimmed);
          }}
        >
          <h3 className="text-lg font-bold">Invite a teammate</h3>
          <p className="mt-2 text-sm text-base-content/60">
            They&rsquo;ll join as an Admin with full access to each project
            except for billing. The invitation link expires in 7 days.
          </p>
          <label className="form-control mt-4 w-full">
            <span className="label-text pb-1 text-xs text-base-content/60">
              Email
            </span>
            <input
              type="email"
              className="input input-sm input-bordered w-full"
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              autoFocus
            />
          </label>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={inviteMutation.isPending || !email.trim()}
            >
              {inviteMutation.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
