import { useMutation } from "@tanstack/react-query";
import { useState, useId } from "react";
import { toast } from "sonner";
import { getErrorCode } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { sendTeamInvitation } from "@/serverFunctions/organization";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Field } from "@/client/components/ui/field";
import { Label } from "@/client/components/ui/label";

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
  const inviteEmailId = useId();
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = email.trim();
            if (trimmed) inviteMutation.mutate(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They&rsquo;ll join as an Admin with full access to each project
              except for billing. The invitation link expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <Label htmlFor={inviteEmailId}>Email</Label>
            <Input
              id={inviteEmailId}
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              disabled={inviteMutation.isPending || !email.trim()}
            >
              {inviteMutation.isPending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
