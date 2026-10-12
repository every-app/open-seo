import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryState } from "@/client/components/QueryState";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { revalidateLogic } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { SectionHeader } from "@/client/components/PageHeader";
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
import { RowActionsMenu } from "@/client/components/RowActionsMenu";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { CopyButton } from "@/client/components/CopyButton";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";

// Better Auth rejects longer names with INVALID_NAME_LENGTH.
const MAX_KEY_NAME_LENGTH = 32;

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export function ApiKeySettings() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(
    null,
  );

  const mcpUrl =
    typeof window === "undefined"
      ? "https://app.openseo.so/mcp"
      : `${window.location.origin}/mcp`;

  const apiKeysQuery = useQuery({
    queryKey: ["apiKeys"],
    queryFn: async () => {
      const result = await authClient.apiKey.list();
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to load API keys");
      }
      return result.data.apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        start: key.start,
        createdAt: new Date(key.createdAt),
        lastRequest: key.lastRequest ? new Date(key.lastRequest) : null,
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (keyName: string) => {
      const result = await authClient.apiKey.create({ name: keyName });
      if (result.error || !result.data?.key) {
        throw new Error(result.error?.message ?? "Failed to create the key");
      }
      return result.data.key;
    },
    onSuccess: (key) => {
      setCreatedKey(key);
      captureClientEvent("mcp:api_key_created");
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const result = await authClient.apiKey.delete({ keyId });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to revoke the key");
      }
    },
    onSuccess: () => {
      captureClientEvent("mcp:api_key_revoked");
      toast.success("API key revoked");
      setRevoking(null);
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  const form = useAppForm({
    defaultValues: { name: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createKeySchema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value.name.trim());
    },
  });

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreatedKey(null);
    form.reset();
  };

  return (
    <section className="space-y-3">
      <SectionHeader title="API keys" />
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">
            Authenticate MCP clients when OAuth doesn't work
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use this for remote agents like Hermes where the normal login flow
            doesn't work.
          </p>
          <p className="mt-1 text-sm">
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://openseo.so/docs/mcp"
              target="_blank"
              rel="noreferrer"
            >
              Setup guide
            </a>
          </p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          Create API key
        </Button>
      </div>

      <QueryState
        query={apiKeysQuery}
        errorFallback="We couldn't load your API keys."
      >
        {(apiKeys) =>
          apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {key.name || "Unnamed key"}
                      </TableCell>
                      <TableCell
                        className="font-mono text-xs text-muted-foreground"
                        data-ph-mask
                      >
                        {key.start || "oseo_"}…
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {key.createdAt.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {key.lastRequest
                          ? key.lastRequest.toLocaleDateString()
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <RowActionsMenu
                          label={`Actions for ${key.name || "API key"}`}
                        >
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              setRevoking({
                                id: key.id,
                                name: key.name || "Unnamed key",
                              })
                            }
                          >
                            <Trash2 />
                            Revoke key
                          </DropdownMenuItem>
                        </RowActionsMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )
        }
      </QueryState>

      {revoking ? (
        <ConfirmDialog
          title={`Revoke \u201c${revoking.name}\u201d?`}
          confirmLabel="Revoke key"
          destructive
          pending={revokeMutation.isPending}
          onClose={() => setRevoking(null)}
          onConfirm={() => revokeMutation.mutate(revoking.id)}
        >
          Clients using it will stop working.
        </ConfirmDialog>
      ) : null}

      <Dialog
        open={isCreateOpen}
        // The key is shown once, so only Done closes the reveal step. Escape
        // and an outside click close the name step.
        onOpenChange={(open) => {
          if (!open && createdKey == null) closeCreateModal();
        }}
      >
        <DialogContent
          showCloseButton={false}
          // A minmax(0, 1fr) track, so the long key scrolls in its box and does
          // not push the Copy and Done buttons out of the dialog.
          className="grid-cols-1 sm:max-w-md"
        >
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Copy your new API key</DialogTitle>
                <DialogDescription>
                  It won't be shown again. Send it as{" "}
                  <span className="font-mono text-xs">
                    Authorization: Bearer
                  </span>{" "}
                  to{" "}
                  <span className="font-mono text-xs break-all">{mcpUrl}</span>.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2.5 py-2 font-mono text-xs"
                  data-ph-mask
                >
                  {createdKey}
                </code>
                <CopyButton
                  value={createdKey}
                  successMessage="API key copied"
                  label="Copy API key"
                  variant="ghost"
                  size="icon-sm"
                />
              </div>
              <DialogFooter>
                <Button onClick={closeCreateModal}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form.AppForm>
              <form.Form className="grid gap-4">
                <DialogHeader>
                  <DialogTitle>Create API key</DialogTitle>
                </DialogHeader>
                <form.AppField name="name">
                  {(field) => (
                    <field.TextField
                      label="Name"
                      placeholder="Claude Code on laptop"
                      maxLength={MAX_KEY_NAME_LENGTH}
                      required
                      autoFocus
                    />
                  )}
                </form.AppField>
                <DialogFooter>
                  <Button variant="ghost" onClick={closeCreateModal}>
                    Cancel
                  </Button>
                  <form.SubmitButton>Create</form.SubmitButton>
                </DialogFooter>
              </form.Form>
            </form.AppForm>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
