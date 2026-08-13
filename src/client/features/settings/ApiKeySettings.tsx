import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PortalMenu } from "@/client/components/PortalMenu";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";

// Better Auth rejects longer names with INVALID_NAME_LENGTH.
const MAX_KEY_NAME_LENGTH = 32;

export function ApiKeySettings() {
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
      <h2 className="text-sm font-medium text-base-content/50">API keys</h2>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">
            Authenticate MCP clients when OAuth doesn't work
          </p>
          <p className="mt-1 text-sm text-base-content/60">
            Use this for remote agents like Hermes where the normal login flow
            doesn't work.
          </p>
          <p className="mt-1 text-sm">
            <a
              className="link link-primary"
              href="https://openseo.so/docs/mcp"
              target="_blank"
              rel="noreferrer"
            >
              Setup guide
            </a>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setIsCreateOpen(true)}
        >
          Create API key
        </button>
      </div>

      {apiKeysQuery.isError ? (
        <p className="text-sm text-error">We couldn't load your API keys.</p>
      ) : apiKeys.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Created</th>
                <th>Last used</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((key) => (
                <tr key={key.id} className="hover">
                  <td className="max-w-[220px] truncate font-medium">
                    {key.name || "Unnamed key"}
                  </td>
                  <td className="font-mono text-xs text-base-content/70">
                    {key.start || "oseo_"}…
                  </td>
                  <td className="text-xs text-base-content/70">
                    {key.createdAt.toLocaleDateString()}
                  </td>
                  <td className="text-xs text-base-content/70">
                    {key.lastRequest
                      ? key.lastRequest.toLocaleDateString()
                      : "Never"}
                  </td>
                  <td>
                    <PortalMenu
                      ariaLabel={`Actions for ${key.name || "API key"}`}
                    >
                      {(close) => (
                        <li>
                          <button
                            className="text-error"
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
                          </button>
                        </li>
                      )}
                    </PortalMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isCreateOpen ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            {createdKey ? (
              <>
                <h3 className="text-lg font-bold">Copy your new API key</h3>
                <p className="mt-2 text-sm text-base-content/60">
                  It won't be shown again. Send it as{" "}
                  <span className="font-mono text-xs">
                    Authorization: Bearer
                  </span>{" "}
                  to <span className="font-mono text-xs">{mcpUrl}</span>.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded bg-base-200 px-2.5 py-2 font-mono text-xs">
                    {createdKey}
                  </code>
                  <CopyButton
                    value={createdKey}
                    successMessage="API key copied"
                    iconOnly
                  />
                </div>
                <div className="modal-action">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={closeCreateModal}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) createMutation.mutate(name.trim());
                }}
              >
                <h3 className="text-lg font-bold">Create API key</h3>
                <label className="form-control mt-4 w-full">
                  <span className="label-text pb-1 text-xs text-base-content/60">
                    Name
                  </span>
                  <input
                    className="input input-sm input-bordered w-full"
                    placeholder="Claude Code on laptop"
                    value={name}
                    maxLength={MAX_KEY_NAME_LENGTH}
                    onChange={(event) => setName(event.currentTarget.value)}
                    required
                    autoFocus
                  />
                </label>
                <div className="modal-action">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={closeCreateModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={createMutation.isPending || !name.trim()}
                  >
                    {createMutation.isPending ? "Creating…" : "Create"}
                  </button>
                </div>
              </form>
            )}
          </div>
          {/* No backdrop close on the reveal step: the key is shown once. */}
          {createdKey ? (
            <div className="modal-backdrop" />
          ) : (
            <div className="modal-backdrop" onClick={closeCreateModal} />
          )}
        </div>
      ) : null}
    </section>
  );
}
