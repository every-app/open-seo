import { BingGlyph } from "@/client/features/bing/BingGlyph";
import { startBingLink } from "@/client/features/bing/startBingLink";

type SiteOption = {
  siteUrl: string;
  isVerified: boolean;
  selectable: boolean;
  isSelected: boolean;
};

type AccountOption = {
  accountId: string;
  email: string | null;
  requiresReconnect: boolean;
  sites: SiteOption[];
};

export type BingSiteSelection = {
  accountId: string;
  siteUrl: string;
};

type SecondaryAction = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * Verified-site selector for connected Bing accounts. Mirrors the Search
 * Console SitePicker; the difference is that Bing gates selection on a plain
 * `isVerified` boolean rather than a permission-level string, so an
 * unselectable row means "not verified in Bing Webmaster Tools yet" rather
 * than "you lack access".
 */
export function BingSitePicker({
  loading,
  error,
  accounts,
  selection,
  onSelect,
  onSave,
  saving,
  onRetry,
  onReconnect,
  secondaryAction,
}: {
  loading: boolean;
  error: boolean;
  accounts: AccountOption[];
  selection: BingSiteSelection | null;
  onSelect: (selection: BingSiteSelection) => void;
  onSave: () => void;
  saving: boolean;
  onRetry: () => void;
  onReconnect: () => void;
  secondaryAction?: SecondaryAction;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/50">
        <span className="loading loading-spinner loading-sm" />
        Loading sites…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Couldn't load your Bing Webmaster sites.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    );
  }

  const allAccountsRequireReconnect =
    accounts.length > 0 &&
    accounts.every((account) => account.requiresReconnect);
  if (allAccountsRequireReconnect) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Connection expired. Reconnect to continue.
        </p>
        <button
          type="button"
          onClick={onReconnect}
          className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-base-200"
        >
          <BingGlyph className="size-[18px]" />
          Reconnect with Bing
        </button>
      </div>
    );
  }

  const healthyAccounts = accounts.filter(
    (account) => !account.requiresReconnect,
  );
  const options = healthyAccounts.flatMap((account) =>
    account.sites.map((site) => ({
      accountId: account.accountId,
      siteUrl: site.siteUrl,
    })),
  );
  const selectedIndex = selection
    ? options.findIndex(
        (option) =>
          option.accountId === selection.accountId &&
          option.siteUrl === selection.siteUrl,
      )
    : -1;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-base-content/80">
          Site
        </span>
        <select
          className="select select-bordered w-full max-w-md"
          value={selectedIndex >= 0 ? String(selectedIndex) : ""}
          onChange={(event) => {
            const option = options[Number(event.target.value)];
            if (option) onSelect(option);
          }}
        >
          <option value="" disabled>
            Select a site…
          </option>
          {healthyAccounts.map((account) => (
            <optgroup
              key={account.accountId}
              label={account.email ?? "Bing account"}
            >
              {account.sites.length === 0 ? (
                <option disabled>No sites</option>
              ) : (
                account.sites.map((site) => {
                  const index = options.findIndex(
                    (option) =>
                      option.accountId === account.accountId &&
                      option.siteUrl === site.siteUrl,
                  );
                  return (
                    <option
                      key={site.siteUrl}
                      value={index}
                      disabled={!site.selectable}
                    >
                      {site.siteUrl}
                      {site.selectable ? "" : "  (not verified)"}
                    </option>
                  );
                })
              )}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={selectedIndex < 0 || saving}
        >
          {saving ? "Saving…" : "Save site"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void startBingLink(window.location.href)}
        >
          Connect another Bing account
        </button>
        {secondaryAction ? (
          <button
            type="button"
            className={[
              "btn btn-ghost btn-sm",
              secondaryAction.destructive ? "text-error hover:bg-error/10" : "",
            ].join(" ")}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
          >
            {secondaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
