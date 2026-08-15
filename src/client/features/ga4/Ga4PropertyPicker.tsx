import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { startGoogleLink } from "@/client/features/integrations/startGoogleLink";

type PropertyOption = {
  propertyId: string;
  displayName: string;
  accountDisplayName: string;
  isSelected: boolean;
};

type AccountOption = {
  accountId: string;
  email: string | null;
  requiresReconnect: boolean;
  propertiesUnavailable: boolean;
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

export function Ga4PropertyPicker({
  loading,
  error,
  accounts,
  selection,
  onSelect,
  onSave,
  saving,
  onRetry,
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
  secondaryAction?: SecondaryAction;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/50">
        <span className="loading loading-spinner loading-sm" />
        正在加载媒体资源…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          无法加载您的 Google Analytics 媒体资源。
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRetry}
          >
            重试
          </button>
          {secondaryAction ? (
            <SecondaryActionButton action={secondaryAction} />
          ) : null}
        </div>
      </div>
    );
  }

  const allAccountsRequireReconnect =
    accounts.length > 0 &&
    accounts.every((account) => account.requiresReconnect);
  if (allAccountsRequireReconnect) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">连接已过期，请重新连接后继续。</p>
        <div className="flex flex-wrap items-center gap-1">
          <GoogleConnectButton
            label="重新连接 Google"
            onClick={() => void startGoogleLink("ga4", window.location.href)}
          />
          {secondaryAction ? (
            <SecondaryActionButton action={secondaryAction} />
          ) : null}
        </div>
      </div>
    );
  }

  const usableAccounts = accounts.filter(
    (account) => !account.requiresReconnect && !account.propertiesUnavailable,
  );
  const options = usableAccounts.flatMap((account) =>
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
  const hasUnavailableAccounts = accounts.some(
    (account) => account.propertiesUnavailable,
  );

  return (
    <div className="space-y-4">
      {hasUnavailableAccounts ? (
        <p className="text-sm text-warning">
          部分媒体资源无法加载。请确认已启用 Analytics Admin API，且此 Google
          账户拥有媒体资源访问权限。
        </p>
      ) : null}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-base-content/80">
          媒体资源
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
            选择媒体资源…
          </option>
          {usableAccounts.map((account) => (
            <optgroup
              key={account.accountId}
              label={account.email ?? "Google 账户"}
            >
              {account.properties.length === 0 ? (
                <option disabled>没有媒体资源</option>
              ) : (
                account.properties.map((property) => {
                  const index = options.findIndex(
                    (option) =>
                      option.accountId === account.accountId &&
                      option.propertyId === property.propertyId,
                  );
                  return (
                    <option key={property.propertyId} value={index}>
                      {property.accountDisplayName} · {property.displayName}
                    </option>
                  );
                })
              )}
            </optgroup>
          ))}
        </select>
      </label>
      {options.length === 0 && !hasUnavailableAccounts ? (
        <p className="text-sm text-base-content/60">
          此账户没有可用的 Google Analytics 媒体资源。
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={selectedIndex < 0 || saving}
        >
          {saving ? "保存中…" : "保存媒体资源"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void startGoogleLink("ga4", window.location.href)}
        >
          连接其他 Google 账户
        </button>
        {secondaryAction ? (
          <SecondaryActionButton action={secondaryAction} />
        ) : null}
      </div>
    </div>
  );
}

function SecondaryActionButton({ action }: { action: SecondaryAction }) {
  return (
    <button
      type="button"
      className={[
        "btn btn-ghost btn-sm",
        action.destructive ? "text-error hover:bg-error/10" : "",
      ].join(" ")}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.label}
    </button>
  );
}

function GoogleConnectButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-base-200"
    >
      <GoogleGlyph className="size-[18px]" />
      {label}
    </button>
  );
}
