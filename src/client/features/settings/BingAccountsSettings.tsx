import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { SectionHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Skeleton } from "@/client/components/ui/skeleton";
import { BingLinkErrorAlert } from "@/client/features/integrations/BingLinkErrorAlert";
import { BingWebmasterLogo } from "@/client/features/integrations/BingWebmasterLogo";
import { startBingLinkFlow } from "@/client/features/integrations/bingLink";
import { useLinkRedirectPending } from "@/client/features/integrations/linkRedirect";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { BING_WEBMASTER_API_KEY_DOCS_URL } from "@/shared/bing";
import {
  listBingAccounts,
  removeBingApiKey,
  removeBingOAuthGrant,
  saveBingApiKey,
} from "@/serverFunctions/bing";

const accountsKey = ["bingAccounts"];

/**
 * The signed-in user's own Bing Webmaster accounts, on the Personal settings
 * page. Keys are per user (not per project), so this is where they are added
 * and removed; projects only pick a verified site on one of them.
 */
export function BingAccountsSettings() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = React.useState("");
  // The key form is hidden by default when OAuth is available; a key is only
  // revealed once the user opts in, and is verified with Bing before saving.
  const [showKeyForm, setShowKeyForm] = React.useState(false);
  const [removing, setRemoving] = React.useState<{
    credentialId: string | null;
    label: string;
    oauth: boolean;
  } | null>(null);
  const linking = useLinkRedirectPending();

  const accountsQuery = useQuery({
    queryKey: accountsKey,
    queryFn: () => listBingAccounts(),
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const hasOAuthGrant = accountsQuery.data?.hasOAuthGrant === true;
  const oauthRequiresReconnect =
    accountsQuery.data?.oauthRequiresReconnect === true;
  const oauthUnavailable = accountsQuery.data?.oauthUnavailable === true;
  const bingOAuthConfigured = accountsQuery.data?.bingOAuthConfigured === true;
  const showKey = showKeyForm || !bingOAuthConfigured;
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: accountsKey });
    // Removing an account cascades its project mappings.
    void queryClient.invalidateQueries({ queryKey: ["bingConnection"] });
    void queryClient.invalidateQueries({ queryKey: ["bingSites"] });
  };

  const saveMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: () => saveBingApiKey({ data: { apiKey: apiKey.trim() } }),
    onSuccess: () => {
      captureClientEvent("bing:key_save", { source: "account_settings" });
      toast.success("Bing account added");
      setApiKey("");
      invalidate();
    },
  });
  const removeMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (credentialId: string | null) =>
      credentialId === null
        ? removeBingOAuthGrant()
        : removeBingApiKey({ data: { credentialId } }),
    onSuccess: (_result, credentialId) => {
      toast.success(
        credentialId === null ? "Bing disconnected" : "Bing account removed",
      );
      setRemoving(null);
      invalidate();
    },
  });

  const saveErrorMessage = saveMutation.error
    ? getErrorCode(saveMutation.error) === "FORBIDDEN"
      ? "Bing rejected that API key. Check it in Bing Webmaster Tools → Settings → API Access, then try again."
      : getStandardErrorMessage(saveMutation.error)
    : null;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Bing Webmaster Tools"
        hint="Your own Bing accounts — delegated OAuth or API keys. Projects connect to a verified property on one of them."
      />
      <BingLinkErrorAlert />

      {bingOAuthConfigured && !hasOAuthGrant && !accountsQuery.isPending ? (
        <div>
          <Button
            onClick={() => void startBingLinkFlow(window.location.href)}
            disabled={linking || removeMutation.isPending}
            pending={linking}
          >
            <BingWebmasterLogo className="size-4" />
            Connect with Bing
          </Button>
        </div>
      ) : null}

      {accountsQuery.isPending ? (
        <div className="space-y-2" role="status" aria-label="Loading accounts">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : accountsQuery.isError ? (
        <QueryError
          error={accountsQuery.error}
          fallback="Couldn't load your Bing accounts."
          onRetry={() => void accountsQuery.refetch()}
          isRetrying={accountsQuery.isFetching}
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {hasOAuthGrant ? (
            <li className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <BingWebmasterLogo className="size-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    Bing account · OAuth
                  </span>
                  <span
                    className={
                      oauthRequiresReconnect
                        ? "block text-xs text-destructive"
                        : "block text-xs text-muted-foreground"
                    }
                  >
                    {oauthRequiresReconnect
                      ? "Access revoked — reconnect to continue"
                      : oauthUnavailable
                        ? "Couldn't reach Bing"
                        : "Connected with Bing"}
                  </span>
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive"
                disabled={removeMutation.isPending}
                onClick={() =>
                  setRemoving({
                    credentialId: null,
                    label: "Bing account · OAuth",
                    oauth: true,
                  })
                }
              >
                Disconnect
              </Button>
            </li>
          ) : null}
          {accounts.length === 0 && !hasOAuthGrant ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No Bing accounts connected yet.
            </li>
          ) : (
            accounts.map((account) => {
              const label = `Bing account · ${account.keyLast4}`;
              return (
                <li
                  key={account.credentialId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <BingWebmasterLogo className="size-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {label}
                      </span>
                      <span
                        className={
                          account.requiresReconnect
                            ? "block text-xs text-destructive"
                            : "block text-xs text-muted-foreground"
                        }
                      >
                        {account.requiresReconnect
                          ? "Key rejected — remove it and add a new one"
                          : account.unavailable
                            ? "Couldn't load properties from Bing"
                            : `${account.verifiedSiteCount} verified propert${account.verifiedSiteCount === 1 ? "y" : "ies"}`}
                      </span>
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive"
                    disabled={removeMutation.isPending}
                    onClick={() =>
                      setRemoving({
                        credentialId: account.credentialId,
                        label,
                        oauth: false,
                      })
                    }
                  >
                    Remove
                  </Button>
                </li>
              );
            })
          )}
        </ul>
      )}

      {showKey ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <label
                htmlFor="settings-bing-api-key"
                className="mb-1.5 block text-sm font-medium"
              >
                API key
              </label>
              <Input
                id="settings-bing-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Bing Webmaster API key"
              />
            </div>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || apiKey.trim().length === 0}
              pending={saveMutation.isPending}
            >
              Add account
            </Button>
            {bingOAuthConfigured ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setShowKeyForm(false);
                  setApiKey("");
                }}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Generate a key in{" "}
            <a
              href={BING_WEBMASTER_API_KEY_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Settings → API Access
            </a>{" "}
            (the account-level key, not a per-site IndexNow key). The key is
            verified with Bing before it is added, stored encrypted, and never
            shown again.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowKeyForm(true)}
          className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Or add an API key instead
        </button>
      )}
      {saveErrorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {saveErrorMessage}
        </p>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={
            removing.oauth ? "Disconnect Bing?" : `Remove ${removing.label}?`
          }
          confirmLabel={removing.oauth ? "Disconnect" : "Remove account"}
          destructive
          pending={removeMutation.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={() => removeMutation.mutate(removing.credentialId)}
        >
          {removing.oauth
            ? "Bing access is revoked and the account is disconnected from every project that used it. Any of those projects will need a new site selected."
            : "The key is deleted and the account is disconnected from every project that used it. Any of those projects will need a new property selected."}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
