import { AlertTriangle, Check } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";

export type AccountSelection = {
  accountId: string;
  customerId: string;
  loginCustomerId: string | null;
};

type GrantAccounts = {
  accountId: string;
  email: string | null;
  requiresReconnect: boolean;
  accessPending: boolean;
  setupRequired: boolean;
  accountsUnavailable: boolean;
  truncated: boolean;
  accounts: Array<{
    customerId: string;
    loginCustomerId: string | null;
    descriptiveName: string | null;
    currencyCode: string | null;
    hasLocalServicesCampaigns: boolean;
    isSelected: boolean;
  }>;
};

export function GoogleAdsAccountPicker({
  loading,
  error,
  grants,
  selection,
  onSelect,
  onSave,
  saving,
  linking,
  onRetry,
  onCancel,
  onReconnect,
}: {
  loading: boolean;
  error: boolean;
  grants: GrantAccounts[];
  selection: AccountSelection | null;
  onSelect: (selection: AccountSelection) => void;
  onSave: () => void;
  saving: boolean;
  linking: boolean;
  onRetry: () => void;
  onCancel?: () => void;
  onReconnect: () => void;
}) {
  if (loading) {
    return <Spinner size="sm" label="Loading Google Ads accounts…" />;
  }
  if (error) {
    return (
      <QueryError
        fallback="Could not load Google Ads accounts."
        onRetry={onRetry}
      />
    );
  }
  const accessPending = grants.some((grant) => grant.accessPending);
  const setupRequired = grants.some((grant) => grant.setupRequired);
  const requiresReconnect = grants.some((grant) => grant.requiresReconnect);
  const accountsUnavailable = grants.some((grant) => grant.accountsUnavailable);
  const truncated = grants.some((grant) => grant.truncated);
  const connectedEmail =
    grants.map((grant) => grant.email).find(Boolean) ?? null;
  const candidates = grants.flatMap((grant) =>
    grant.accounts.map((candidate) => ({ grant, candidate })),
  );
  const reconnectButton = (
    <Button variant="outline" size="sm" onClick={onReconnect} pending={linking}>
      {linking ? "Opening Google…" : "Reconnect with Google"}
    </Button>
  );
  return (
    <div className="space-y-4 text-sm">
      {accessPending ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Google Ads API access is still pending on Google&apos;s side
            (developer token approval or API enablement). Until Google approves
            it, OpenSEO can&apos;t read your Ads accounts, so they&apos;ll
            appear here once onboarding finishes — no changes needed here.
          </AlertDescription>
        </Alert>
      ) : null}
      {setupRequired ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            GOOGLE_ADS_DEVELOPER_TOKEN is not set on this deployment, so Google
            Ads accounts can&apos;t be listed. This is a setup step here, not
            something to wait on Google for.
          </AlertDescription>
        </Alert>
      ) : null}
      {requiresReconnect ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            The Google Ads connection expired. Reconnect to continue.
          </p>
          {reconnectButton}
        </div>
      ) : null}
      {candidates.length > 0 ? (
        <div role="group" aria-labelledby="google-ads-account-legend">
          <p
            id="google-ads-account-legend"
            className="mb-2 text-sm font-medium"
          >
            Choose the Ads account with your Local Services campaigns
          </p>
          {truncated ? (
            <p className="mb-2 text-xs text-muted-foreground">
              This Google account reaches more Ads accounts than are listed
              here. If the one you want is missing, connect a Google account
              with narrower access.
            </p>
          ) : null}
          <div className="rounded-lg border border-border p-1.5">
            {candidates.map(({ grant, candidate }) => {
              const chosen =
                selection?.accountId === grant.accountId &&
                selection.customerId === candidate.customerId;
              return (
                <Button
                  key={`${grant.accountId}:${candidate.customerId}`}
                  type="button"
                  variant="ghost"
                  aria-pressed={chosen}
                  disabled={saving}
                  className={`h-auto w-full justify-between gap-3 rounded-md px-2 py-2.5 text-left font-normal hover:bg-accent ${chosen ? "bg-accent" : ""}`}
                  onClick={() =>
                    onSelect({
                      accountId: grant.accountId,
                      customerId: candidate.customerId,
                      loginCustomerId: candidate.loginCustomerId,
                    })
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {candidate.descriptiveName ?? candidate.customerId}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      ID {candidate.customerId}
                      {grant.email ? ` · ${grant.email}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {candidate.hasLocalServicesCampaigns ? (
                      <Badge variant="success">Local Services</Badge>
                    ) : null}
                    {chosen ? <Check className="size-4" /> : null}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      ) : !accessPending && !setupRequired && !requiresReconnect ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            {`No Google Ads accounts found on the connected Google account${connectedEmail ? ` (${connectedEmail})` : ""}.`}
            {accountsUnavailable
              ? " This usually means the Google Ads permission was left unchecked on Google's consent screen."
              : " If this is the wrong Google account, reconnect and pick another."}
          </p>
          {reconnectButton}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" onClick={onSave} disabled={!selection || saving}>
          {saving ? "Saving…" : "Use this account"}
        </Button>
        {onCancel ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
