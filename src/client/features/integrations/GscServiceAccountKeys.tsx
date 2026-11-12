import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
import type { GoogleConnection } from "@/client/features/integrations/googleProviders";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  addGscServiceAccount,
  listGscServiceAccounts,
  removeGscServiceAccount,
} from "@/serverFunctions/gsc";

const serviceAccountsKey = ["gscServiceAccounts"];

/**
 * Lets an admin connect Search Console with a Google service account key
 * instead of signing in with Google. Only shown where the deployment enables
 * it. The key goes to the server once and is never shown again; the account
 * then appears in the property picker like a Google account.
 */
export function GscServiceAccountKeys({
  connection,
  picking,
  onChange,
}: {
  connection: GoogleConnection | undefined;
  /** Whether the member is choosing a property right now. */
  picking: boolean | null;
  onChange: () => void;
}) {
  // Offered where the deployment accepts keys, to members who manage
  // integrations, while the project isn't connected or is being changed.
  const hidden =
    !connection?.serviceAccountsEnabled ||
    !connection.canManage ||
    (connection.connected && !picking);
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [keyJson, setKeyJson] = React.useState("");
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const accountsQuery = useQuery({
    queryKey: serviceAccountsKey,
    queryFn: () => listGscServiceAccounts(),
    enabled: !hidden,
  });
  const afterChange = () => {
    void queryClient.invalidateQueries({ queryKey: serviceAccountsKey });
    onChange();
  };
  const addMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (value: string) =>
      addGscServiceAccount({ data: { keyJson: value } }),
    onSuccess: (saved) => {
      if (!saved.ok) return;
      toast.success(`Service account ${saved.clientEmail} added`);
      setKeyJson("");
      setOpen(false);
      afterChange();
    },
  });
  const removeMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (id: string) => removeGscServiceAccount({ data: { id } }),
    onSuccess: () => {
      toast.success("Service account removed");
      setConfirmingId(null);
      afterChange();
    },
  });

  if (hidden || !accountsQuery.data?.enabled) return null;
  const accounts = accountsQuery.data.accounts;

  const readFile = async (file: File | undefined) => {
    if (file) setKeyJson(await file.text());
  };

  return (
    <div className="mt-4 space-y-2 border-t pt-4 text-sm">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
        >
          <span className="min-w-0 break-all">
            {account.clientEmail}
            <span className="text-muted-foreground">
              {" "}
              · Service account
              {account.projectCount > 0
                ? ` · ${account.projectCount} project${account.projectCount === 1 ? "" : "s"}`
                : null}
            </span>
          </span>
          {confirmingId === account.id ? (
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setConfirmingId(null)}
                disabled={removeMutation.isPending}
              >
                Keep
              </Button>
              <Button
                variant="destructive"
                size="xs"
                onClick={() => removeMutation.mutate(account.id)}
                pending={removeMutation.isPending}
              >
                {account.projectCount > 0
                  ? "Remove and disconnect"
                  : "Remove key"}
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmingId(account.id)}
              aria-label={`Remove ${account.clientEmail}`}
            >
              Remove
            </Button>
          )}
        </div>
      ))}

      {open ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            addMutation.mutate(keyJson);
          }}
        >
          <p className="text-muted-foreground">
            Paste the JSON key of a Google service account, then add its email
            as a <strong>Restricted</strong> user on your Search Console
            property. The key is encrypted and never shown again.
          </p>
          <Textarea
            aria-label="Service account JSON key"
            value={keyJson}
            onChange={(event) => setKeyJson(event.target.value)}
            placeholder='{ "type": "service_account", ... }'
            rows={4}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          {addMutation.error || addMutation.data?.ok === false ? (
            <p role="alert" className="text-destructive">
              {addMutation.data?.ok === false
                ? addMutation.data.message
                : getStandardErrorMessage(addMutation.error)}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setKeyJson("");
                addMutation.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              Choose file
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!keyJson.trim()}
              pending={addMutation.isPending}
            >
              Save key
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2"
          onClick={() => setOpen(true)}
        >
          <KeyRound className="size-3.5" />
          Use a service account key
        </Button>
      )}
      {removeMutation.error ? (
        <p role="alert" className="text-destructive">
          {getStandardErrorMessage(removeMutation.error)}
        </p>
      ) : null}
    </div>
  );
}
