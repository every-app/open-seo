import { useMutation } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { getErrorCode } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { isHostedClientAuthMode, usesBetterAuthClient } from "@/lib/auth-mode";
import { sendTeamInvitation } from "@/serverFunctions/organization";

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

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

// Without an email transport (the standalone Docker edition) the server hands
// back the invitation link for the inviter to pass on; with one, it was sent.
export function announceInvitation(
  result: { invitationId: string; inviteUrl?: string },
  sentMessage: string,
) {
  if (!result.inviteUrl) {
    toast.success(sentMessage);
    return;
  }
  const inviteUrl = result.inviteUrl;
  void (
    navigator.clipboard?.writeText(inviteUrl) ?? Promise.reject(new Error())
  ).then(
    () => toast.success("Invitation link copied"),
    () =>
      toast.success("Invitation link", {
        description: inviteUrl,
        duration: 20000,
      }),
  );
}

export function InviteTeammateModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  // Server function (not authClient.inviteMember): it enforces the daily send
  // limits and fails visibly when the invite email doesn't send.
  const inviteMutation = useMutation({
    mutationFn: (inviteeEmail: string) =>
      sendTeamInvitation({ data: { email: inviteeEmail } }),
    onSuccess: (result) => {
      captureClientEvent("team:invitation_send");
      announceInvitation(result, "Invitation sent");
      onInvited();
      onClose();
    },
    onError: (error: Error) => {
      if (getErrorCode(error) === "CONFLICT") {
        form.setErrorMap({
          onSubmit: { fields: { email: "This person is already a member." } },
        });
      } else {
        toast.error(inviteErrorMessage(error));
      }
      // An email-send failure still creates the pending row — show it.
      onInvited();
    },
  });

  const sharesLink = usesBetterAuthClient() && !isHostedClientAuthMode();

  const form = useAppForm({
    defaultValues: { email: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: inviteSchema },
    onSubmit: ({ value }) => inviteMutation.mutateAsync(value.email.trim()),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inviteMutation.isPending) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form.AppForm>
          <form.Form className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Invite a teammate</DialogTitle>
              <DialogDescription>
                {sharesLink
                  ? "They'll join as an Admin with full access to each project. Share the invitation link with them; they create their account from it. It expires in 7 days."
                  : "They'll join as an Admin with full access to each project except for billing. The invitation link expires in 7 days."}
              </DialogDescription>
            </DialogHeader>
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  label="Email"
                  type="email"
                  placeholder="teammate@company.com"
                  required
                  autoFocus
                />
              )}
            </form.AppField>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={inviteMutation.isPending}
              >
                Cancel
              </Button>
              <form.SubmitButton>Send invite</form.SubmitButton>
            </DialogFooter>
          </form.Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}
