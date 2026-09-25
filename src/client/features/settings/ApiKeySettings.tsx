import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "@/client/components/icons";
import { useState, useId } from "react";
import { toast } from "sonner";
import { PortalMenu } from "@/client/components/PortalMenu";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
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

// Better Auth rejects longer names with INVALID_NAME_LENGTH.
const MAX_KEY_NAME_LENGTH = 32;

export function ApiKeySettings() {
  const apiKeyNameId = useId();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

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
      setName("");
      captureClientEvent("mcp:api_key_created");
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error));
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
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error));
    },
  });

  const apiKeys = apiKeysQuery.data ?? [];

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreatedKey(null);
    setName("");
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">API keys</h2>
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
              className="underline underline-offset-4 text-link"
              href="https://openseo.so/docs/mcp"
              target="_blank"
              rel="noreferrer"
            >
              Setup guide
            </a>
          </p>
        </div>
        <Button size="sm" type="button" onClick={() => setIsCreateOpen(true)}>
          Create API key
        </Button>
      </div>

      {apiKeysQuery.isError ? (
        <p className="text-sm text-negative">We couldn't load your API keys.</p>
      ) : apiKeys.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="max-w-[13.75rem] truncate font-medium">
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
                  <PortalMenu
                    ariaLabel={`Actions for ${key.name || "API key"}`}
                  >
                    {(close) => (
                      <DropdownMenuItem
                        className="text-negative"
                        disabled={
                          revokeMutation.isPending &&
                          revokeMutation.variables === key.id
                        }
                        onClick={() => {
                          close();
                          if (
                            window.confirm(
                              `Revoke "${key.name || "Unnamed key"}"? Clients using it will stop working.`,
                            )
                          ) {
                            revokeMutation.mutate(key.id);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Revoke key
                      </DropdownMenuItem>
                    )}
                  </PortalMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {isCreateOpen ? (
        <Dialog
          open
          // No backdrop close on the reveal step: the key is shown once.
          disablePointerDismissal={createdKey !== null}
          onOpenChange={(open) => {
            if (!open) closeCreateModal();
          }}
        >
          <DialogContent className="max-w-md" showClose={createdKey === null}>
            {createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>Copy your new API key</DialogTitle>
                  <DialogDescription>
                    It won't be shown again. Send it as{" "}
                    <span className="font-mono text-xs">
                      Authorization: Bearer
                    </span>{" "}
                    to <span className="font-mono text-xs">{mcpUrl}</span>.
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
                    iconOnly
                  />
                </div>
                <DialogFooter>
                  <Button size="sm" type="button" onClick={closeCreateModal}>
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) createMutation.mutate(name.trim());
                }}
              >
                <DialogTitle>Create API key</DialogTitle>
                <Field>
                  <Label htmlFor={apiKeyNameId}>Name</Label>
                  <Input
                    id={apiKeyNameId}
                    placeholder="Claude Code on laptop"
                    value={name}
                    maxLength={MAX_KEY_NAME_LENGTH}
                    onChange={(event) => setName(event.currentTarget.value)}
                    required
                    autoFocus
                  />
                </Field>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={closeCreateModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    type="submit"
                    disabled={createMutation.isPending || !name.trim()}
                  >
                    {createMutation.isPending ? "Creating…" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
