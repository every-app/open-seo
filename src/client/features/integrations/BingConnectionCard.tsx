import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { QueryError } from "@/client/components/QueryState";
import { CardShell } from "@/client/components/CardShell";
import { PermissionHint } from "@/client/components/PermissionHint";
import { BingWebmasterLogo } from "@/client/features/integrations/BingWebmasterLogo";
import { BingConnectOptions } from "@/client/features/integrations/BingConnectOptions";
import { BingLinkErrorAlert } from "@/client/features/integrations/BingLinkErrorAlert";
import {
  BingAccountPicker,
  type BingPickerSelection,
} from "@/client/features/integrations/BingAccountPicker";
import { useBingPickerResume } from "@/client/features/integrations/bingLink";
import { useLinkRedirectPending } from "@/client/features/integrations/linkRedirect";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  disconnectBing,
  getBingConnection,
  listBingSites,
  removeBingApiKey,
  removeBingOAuthGrant,
  saveBingApiKey,
  setBingSite,
} from "@/serverFunctions/bing";

const connectionKey = (projectId: string) => ["bingConnection", projectId];
const sitesKey = (projectId: string) => ["bingSites", projectId];

/**
 * Connects one project to Bing Webmaster Tools: link a Bing account with
 * OAuth or add API keys, pick a verified site on any of them, change it, or
 * disconnect.
 */
export function BingConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [selection, setSelection] = React.useState<BingPickerSelection | null>(
    null,
  );
  const { picking, setPicking, linkAccount } = useBingPickerResume(projectId);
  const linking = useLinkRedirectPending();

  const connectionQuery = useQuery({
    queryKey: connectionKey(projectId),
    queryFn: () => getBingConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const hasCredentials = Boolean(connection?.hasCredentials);
  const canManage = connection?.canManage === true;
  const bingOAuthConfigured = connection?.bingOAuthConfigured === true;
  const showPicker =
    hasCredentials && !adding && picking !== false && (picking || !connected);

  const sitesQuery = useQuery({
    queryKey: sitesKey(projectId),
    queryFn: () => listBingSites({ data: { projectId } }),
    enabled: showPicker,
  });
  const accounts = sitesQuery.data?.accounts ?? [];

  // Preselect the saved site when reopening the picker.
  React.useEffect(() => {
    const list = sitesQuery.data?.accounts;
    if (!list || selection) return;
    for (const account of list) {
      const saved = account.sites.find((site) => site.isSelected);
      if (saved) {
        setSelection({
          credentialId: account.credentialId,
          siteUrl: saved.url,
        });
        return;
      }
    }
  }, [sitesQuery.data, selection]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: sitesKey(projectId) });
  };

  const saveKeyMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: () => saveBingApiKey({ data: { apiKey: apiKey.trim() } }),
    onSuccess: () => {
      captureClientEvent("bing:key_save");
      toast.success("Bing account added");
      setApiKey("");
      setAdding(false);
      setPicking(true);
      invalidate();
    },
  });
  const setSiteMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (selected: BingPickerSelection) =>
      setBingSite({
        data: {
          projectId,
          credentialId: selected.credentialId,
          siteUrl: selected.siteUrl,
        },
      }),
    onSuccess: () => {
      captureClientEvent("bing:site_select");
      toast.success("Bing Webmaster connected");
      setPicking(false);
      invalidate();
    },
  });
  const disconnectMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: () => disconnectBing({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Bing Webmaster disconnected from this project");
      setSelection(null);
      setPicking(false);
      invalidate();
    },
  });
  const removeAccountMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (credentialId: string | null) =>
      credentialId === null
        ? removeBingOAuthGrant()
        : removeBingApiKey({ data: { credentialId } }),
    onSuccess: (_result, credentialId) => {
      toast.success(
        credentialId === null ? "Bing disconnected" : "Bing account removed",
      );
      setSelection((current) =>
        current?.credentialId === credentialId ? null : current,
      );
      invalidate();
    },
  });

  const busy =
    saveKeyMutation.isPending ||
    setSiteMutation.isPending ||
    disconnectMutation.isPending ||
    removeAccountMutation.isPending ||
    linking;
  // The key form gets Bing-specific copy: a rejected key is the common case
  // and the generic FORBIDDEN text doesn't say that.
  const saveKeyErrorMessage = saveKeyMutation.error
    ? getErrorCode(saveKeyMutation.error) === "FORBIDDEN"
      ? "Bing rejected that API key. Check it in Bing Webmaster Tools → Settings → API Access, then try again."
      : getStandardErrorMessage(saveKeyMutation.error)
    : null;
  const otherMutationError =
    setSiteMutation.error ??
    disconnectMutation.error ??
    removeAccountMutation.error;

  return (
    <CardShell
      title="Bing Webmaster Tools"
      icon={<BingWebmasterLogo className="size-5" />}
      action={
        connectionQuery.isPending ? undefined : (
          <Badge variant={connected ? "success" : "outline"}>
            <span className="size-1.5 rounded-full bg-current" />
            {connected ? "Connected" : "Not connected"}
          </Badge>
        )
      }
    >
      <BingLinkErrorAlert className="mb-4" />
      {connectionQuery.isPending ? (
        <div
          role="status"
          aria-label="Loading connection"
          className="space-y-3"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-9 w-24" />
        </div>
      ) : connectionQuery.isError ? (
        <QueryError
          error={connectionQuery.error}
          fallback="Couldn't check this project's Bing connection."
          onRetry={() => void connectionQuery.refetch()}
          isRetrying={connectionQuery.isFetching}
        />
      ) : connected && !picking && !adding ? (
        <div className="space-y-4">
          <p className="break-words text-sm font-semibold">
            {connection?.siteUrl}
          </p>
          {connection && connection.credentialCount > 1 ? (
            <p className="text-xs text-muted-foreground">
              {connection.credentialCount} Bing accounts connected
            </p>
          ) : null}
          {canManage ? (
            <fieldset
              disabled={busy}
              className="flex flex-wrap items-center gap-1"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelection(null);
                  setPicking(true);
                }}
              >
                Change property or account
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                pending={disconnectMutation.isPending}
              >
                Disconnect project
              </Button>
            </fieldset>
          ) : null}
        </div>
      ) : showPicker ? (
        <BingAccountPicker
          accounts={accounts}
          loading={sitesQuery.isLoading}
          isError={sitesQuery.isError}
          onRetry={() => void sitesQuery.refetch()}
          selection={selection}
          onSelect={setSelection}
          onSave={() => selection && setSiteMutation.mutate(selection)}
          saving={setSiteMutation.isPending}
          onAddAccount={() => {
            setAdding(true);
            setApiKey("");
          }}
          onRemoveAccount={(credentialId) =>
            removeAccountMutation.mutate(credentialId)
          }
          onCancel={() => {
            setPicking(false);
            setSelection(null);
          }}
        />
      ) : (
        <BingConnectOptions
          bingOAuthConfigured={bingOAuthConfigured}
          adding={adding}
          busy={busy}
          linking={linking}
          onConnect={() => void linkAccount(window.location.href)}
          onUseKey={() => {
            setApiKey("");
            setAdding(true);
          }}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          onSaveKey={() => saveKeyMutation.mutate()}
          savingKey={saveKeyMutation.isPending}
          onCancelKey={() => {
            setAdding(false);
            setApiKey("");
          }}
        />
      )}

      {(saveKeyErrorMessage ?? otherMutationError) ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {saveKeyErrorMessage ??
            (otherMutationError
              ? getStandardErrorMessage(otherMutationError)
              : "")}
        </p>
      ) : null}
      {connectionQuery.isSuccess && !canManage ? (
        <PermissionHint
          action="change this project's Bing connection"
          className="mt-3"
        />
      ) : null}
    </CardShell>
  );
}
