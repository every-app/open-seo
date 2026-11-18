import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { SectionHeader } from "@/client/components/PageHeader";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import {
  getAccountDeletionStatus,
  requestAccountDeletion,
} from "@/serverFunctions/account-deletion";
import { formatDeletionDate } from "@/shared/account-deletion";

type Status = Awaited<ReturnType<typeof getAccountDeletionStatus>>;

function blockerText(blocker: Status["blockers"][number]) {
  const others =
    blocker.otherMemberCount === 1
      ? "1 other member"
      : `${blocker.otherMemberCount} other members`;
  return `You own “${blocker.organizationName}”, which has ${others}. Deleting your account would leave them without an owner. Remove them in Organization settings, or email support@openseo.so to hand the workspace to one of them.`;
}

function billingText(charge: Status["billingToStop"][number]) {
  const stops = [
    charge.renewingPlan ? "cancel its paid plan" : null,
    charge.autoReload ? "turn off auto-reload" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return `“${charge.organizationName}”: we'll ${stops}.`;
}

function deletionErrorMessage(error: unknown) {
  switch (getErrorCode(error)) {
    case "FORBIDDEN":
      return "For your security, sign out and sign back in, then try again.";
    case "VALIDATION_ERROR":
      return "Your account can't be deleted yet. Click Delete account again to see why.";
    case "CONFLICT":
      return "Your account is already scheduled for deletion.";
    default:
      return getStandardErrorMessage(error);
  }
}

export function DeleteAccountSettings() {
  const [open, setOpen] = useState(false);
  const statusQuery = useQuery({
    queryKey: ["accountDeletionStatus"],
    queryFn: () => getAccountDeletionStatus(),
    // The fresh sign-in window runs out while the page sits open.
    staleTime: 0,
  });
  const status = statusQuery.data;

  return (
    <section className="space-y-3">
      <SectionHeader title="Delete account" />
      <p className="text-sm text-muted-foreground">
        Permanently delete your account, and every workspace where you are the
        only member, with all its projects and data. You are signed out right
        away and the deletion happens{" "}
        {status ? `${status.deletionDelayDays} days` : "two weeks"} later.
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
        disabled={!status}
        onClick={() => setOpen(true)}
      >
        Delete account
      </Button>

      {open && status ? (
        status.blockers.length > 0 ? (
          <BlockedDialog status={status} onClose={() => setOpen(false)} />
        ) : !status.signedInRecently ? (
          <SignInAgainDialog onClose={() => setOpen(false)} />
        ) : (
          <DeleteAccountDialog status={status} onClose={() => setOpen(false)} />
        )
      ) : null}
    </section>
  );
}

function BlockedDialog({
  status,
  onClose,
}: {
  status: Status;
  onClose: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You can't delete your account yet</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <ul className="list-disc space-y-1 pl-5 text-left">
              {status.blockers.map((blocker) => (
                <li key={blocker.organizationName}>{blockerText(blocker)}</li>
              ))}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SignInAgainDialog({ onClose }: { onClose: () => void }) {
  return (
    <AlertDialog open onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign in again to continue</AlertDialogTitle>
          <AlertDialogDescription>
            For your security, sign out and sign back in before deleting your
            account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={() => signOutAndRedirect()}>Sign out</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountDialog({
  status,
  onClose,
}: {
  status: Status;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [confirmEmail, setConfirmEmail] = useState("");
  const email = session?.user.email ?? "";
  const matches =
    email !== "" && confirmEmail.trim().toLowerCase() === email.toLowerCase();

  const mutation = useMutation({
    mutationFn: () => requestAccountDeletion({ data: { confirmEmail } }),
    onSuccess: ({ deleteAfter }) => {
      toast.success(
        `Your account will be deleted on ${formatDeletionDate(deleteAfter)}.`,
      );
      signOutAndRedirect();
    },
    onError: (error) => {
      toast.error(deletionErrorMessage(error));
      // A blocker or an expired sign-in found by the server: reopening the
      // dialog shows the explanation.
      void queryClient.invalidateQueries({
        queryKey: ["accountDeletionStatus"],
      });
      onClose();
    },
  });

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll be signed out now, and any paid plan and auto-reload on the
            workspaces deleted with your account are canceled. This can't be
            undone after the deletion date. Type your email to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {status.billingToStop.length > 0 ? (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Deleting your account stops billing</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-5">
                {status.billingToStop.map((charge) => (
                  <li key={charge.organizationName}>{billingText(charge)}</li>
                ))}
              </ul>
              <p className="mt-2">
                A canceled plan doesn't renew, and you keep its credits until
                the deletion date.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        <Input
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          placeholder={email}
          aria-label="Your email"
          autoComplete="off"
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!matches}
            pending={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Delete account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
