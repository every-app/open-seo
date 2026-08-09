import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { startGa4Link } from "@/client/features/ga4/startGa4Link";

type PropertyOption = {
  propertyId: string;
  displayName: string;
  isSelected: boolean;
};

type AccountOption = {
  accountId: string;
  email: string | null;
  requiresReconnect: boolean;
  properties: PropertyOption[];
};

export type Ga4PropertySelection = {
  accountId: string;
  propertyId: string;
};

type SecondaryAction = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * Property selector for connected Google accounts. `secondaryAction` is
 * optional — omit it where there's nothing to cancel/disconnect.
 */
export function PropertyPicker({
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
  selection: Ga4PropertySelection | null;
  onSelect: (selection: Ga4PropertySelection) => void;
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
        Loading properties…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Couldn't load your Analytics properties.
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
          <GoogleGlyph className="size-[18px]" />
          Reconnect with Google
        </button>
      </div>
    );
  }

  const healthyAccounts = accounts.filter(
    (account) => !account.requiresReconnect,
  );
  const options = healthyAccounts.flatMap((account) =>
    account.properties.map((property) => ({
      accountId: account.accountId,
      propertyId: property.propertyId,
    })),
  );
  const selectedIndex = selection
    ? options.findIndex(
        (option) =>
          option.accountId === selection.accountId &&
          option.propertyId === selection.propertyId,
      )
    : -1;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-base-content/80">
          Property
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
            Select a property…
          </option>
          {healthyAccounts.map((account) => (
            <optgroup
              key={account.accountId}
              label={account.email ?? "Google account"}
            >
              {account.properties.length === 0 ? (
                <option disabled>No properties</option>
              ) : (
                account.properties.map((property) => {
                  const index = options.findIndex(
                    (option) =>
                      option.accountId === account.accountId &&
                      option.propertyId === property.propertyId,
                  );
                  return (
                    <option key={property.propertyId} value={index}>
                      {property.displayName} ({property.propertyId})
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
          {saving ? "Saving…" : "Save property"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void startGa4Link(window.location.href)}
        >
          Connect another Google account
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
