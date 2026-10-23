import { GscPropertySetupHelp, hasNoGscWebsites } from "./GscPropertySetupHelp";
import { GoogleAccountRemovalDialog } from "@/client/features/integrations/GoogleAccountRemovalDialog";
import { QueryError } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { Button } from "@/client/components/ui/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/client/components/ui/combobox";
import { GSC_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/gsc";
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

const GSC_SETUP_GUIDE_URL =
  "https://openseo.so/blogs/google-search-console-setup";

export type GooglePickerSelection = { accountId: string; propertyId: string };
type Property = {
  id: string;
  name: string;
  detail?: string;
  selectable: boolean;
  isSelected?: boolean;
};
export type GooglePickerAccount = {
  accountId: string;
  email: string | null;
  requiresReconnect: boolean;
  unavailable?: boolean;
  apiDisabled?: boolean;
  properties: Property[];
};
type SecondaryAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

/** One property in the combobox, tagged with the account it belongs to. */
type PropertyOption = GooglePickerSelection & Property;
/** One account's properties: the combobox groups options by account. */
type PropertyGroup = {
  accountId: string;
  label: string;
  items: PropertyOption[];
};

function accountLabel(account: GooglePickerAccount) {
  return account.email ?? `Google account · ${account.accountId.slice(-6)}`;
}

function accountStatus(account: GooglePickerAccount, provider: "gsc" | "ga4") {
  if (account.requiresReconnect) return "Connection expired";
  if (account.unavailable) {
    return account.apiDisabled
      ? "Search Console API isn't enabled"
      : "Couldn't load properties";
  }
  if (account.properties.length === 0) {
    return provider === "gsc" ? "No websites found" : "No properties found";
  }
  return null;
}

function matchesProperty(option: PropertyOption, query: string) {
  return `${option.name} ${option.detail ?? ""} ${option.id}`
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

export function GooglePropertyPicker({
  provider,
  readOnly = false,
  loading,
  linking = false,
  error,
  accounts,
  selection,
  onSelect,
  onSave,
  saving,
  saveLabel = "Save property",
  onRetry,
  onReconnect,
  secondaryAction,
  renderActions,
}: {
  provider: "gsc" | "ga4";
  readOnly?: boolean;
  loading: boolean;
  linking?: boolean;
  error: boolean;
  accounts: GooglePickerAccount[];
  selection: GooglePickerSelection | null;
  onSelect: (selection: GooglePickerSelection | null) => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
  onRetry: () => void;
  onReconnect: () => void;
  secondaryAction?: SecondaryAction;
  renderActions?: (disabled: boolean) => ReactNode;
}) {
  const [removing, setRemoving] = useState<GooglePickerAccount | null>(null);
  // Expired and unreachable accounts have no properties, so they only appear
  // in the accounts list below, where their reconnect and retry actions live.
  const groups: PropertyGroup[] = accounts
    .filter((account) => account.properties.length > 0)
    .map((account) => ({
      accountId: account.accountId,
      label: accountLabel(account),
      items: account.properties.map((property) => ({
        ...property,
        accountId: account.accountId,
        propertyId: property.id,
      })),
    }));
  const options = groups.flatMap((group) => group.items);
  const selected =
    options.find(
      (option) =>
        option.accountId === selection?.accountId &&
        option.propertyId === selection?.propertyId,
    ) ?? null;
  const canSave = Boolean(selected?.selectable) && !loading && !error;
  const emptyGsc =
    provider === "gsc" && hasNoGscWebsites(accounts, loading, error);
  return (
    <div className="space-y-4">
      {removing ? (
        <GoogleAccountRemovalDialog
          provider={provider}
          accountId={removing.accountId}
          label={accountLabel(removing)}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            if (selection?.accountId === removing.accountId) onSelect(null);
            setRemoving(null);
          }}
        />
      ) : null}
      {emptyGsc ? (
        <GscPropertySetupHelp
          accounts={accounts}
          loading={loading}
          busy={saving || linking}
          linking={linking}
          onRetry={onRetry}
          onReconnect={onReconnect}
        />
      ) : null}
      {!emptyGsc || readOnly ? (
        <div className="space-y-4">
          {readOnly ? (
            <p className="text-sm font-medium">Manage Google accounts</p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium">Choose property</p>
              {loading ? (
                <Spinner size="sm" label="Loading properties…" />
              ) : error ? (
                <QueryError
                  fallback="Couldn't load properties."
                  onRetry={onRetry}
                />
              ) : (
                <Combobox
                  items={groups}
                  value={selected}
                  itemToStringLabel={(option) => option.name}
                  isItemEqualToValue={(option, value) =>
                    option.accountId === value.accountId &&
                    option.propertyId === value.propertyId
                  }
                  filter={matchesProperty}
                  autoHighlight
                  onValueChange={(option) => {
                    if (option) {
                      onSelect({
                        accountId: option.accountId,
                        propertyId: option.propertyId,
                      });
                    }
                  }}
                >
                  <ComboboxInput
                    className="w-full"
                    placeholder="Select a property…"
                    aria-label="Search properties"
                    disabled={saving}
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>
                      {options.length > 0
                        ? "No matching properties."
                        : "No properties available. Check the Google accounts below."}
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(group: PropertyGroup) => (
                        <ComboboxGroup
                          key={group.accountId}
                          items={group.items}
                        >
                          <ComboboxLabel className="break-all">
                            {group.label}
                          </ComboboxLabel>
                          <ComboboxCollection>
                            {(option: PropertyOption) => (
                              <ComboboxItem
                                key={`${option.accountId} ${option.id}`}
                                value={option}
                                disabled={!option.selectable}
                              >
                                <span className="min-w-0">
                                  <span className="block break-words">
                                    {option.name}
                                  </span>
                                  {option.detail ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {option.detail}
                                    </span>
                                  ) : null}
                                  {!option.selectable ? (
                                    <span className="block text-xs">
                                      {provider === "gsc"
                                        ? "Ask the property owner for Full access, or verify ownership in Search Console."
                                        : "No verified access"}
                                    </span>
                                  ) : null}
                                </span>
                              </ComboboxItem>
                            )}
                          </ComboboxCollection>
                        </ComboboxGroup>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Google accounts
            </p>
            {accounts.map((account) => {
              const label = accountLabel(account);
              const status = loading ? null : accountStatus(account, provider);
              return (
                <div
                  key={account.accountId}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
                >
                  <span className="min-w-0 break-all">
                    {label}
                    {status ? (
                      <span className="text-muted-foreground"> · {status}</span>
                    ) : null}
                    {account.apiDisabled ? (
                      <>
                        {" "}
                        <a
                          href={`${GSC_SELF_HOSTED_SETUP_DOCS_URL}#troubleshooting`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4"
                        >
                          How to enable it ↗
                        </a>
                      </>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center">
                    {account.requiresReconnect ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={onReconnect}
                        aria-label={`Reconnect ${label}`}
                        disabled={linking}
                        aria-busy={linking}
                      >
                        {linking ? "Opening Google…" : "Reconnect"}
                      </Button>
                    ) : account.unavailable ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={onRetry}
                        aria-label={`Retry ${label}`}
                      >
                        Try again
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive"
                      disabled={saving}
                      onClick={() => setRemoving(account)}
                      aria-label={`Remove ${label}`}
                    >
                      Remove
                    </Button>
                  </span>
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="xs"
              className="-ml-2"
              onClick={onReconnect}
              disabled={saving || linking}
              pending={linking}
            >
              {linking ? null : <Plus className="size-4" />}
              {linking ? "Opening Google…" : "Add Google account"}
            </Button>
            {provider === "gsc" &&
            !loading &&
            !emptyGsc &&
            accounts.some(
              (account) => accountStatus(account, provider) !== null,
            ) ? (
              <p className="text-xs text-muted-foreground">
                Having trouble?{" "}
                <a
                  href={GSC_SETUP_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  Setup guide ↗
                </a>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {renderActions ? (
        renderActions(!canSave || saving)
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {readOnly ? null : (
            <Button size="sm" onClick={onSave} disabled={!canSave || saving}>
              {saving ? "Saving…" : saveLabel}
            </Button>
          )}
          {secondaryAction ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving || secondaryAction.disabled}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
