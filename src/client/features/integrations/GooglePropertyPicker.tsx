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
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

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
  properties: Property[];
};
type SecondaryAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

/** One selectable property, flattened across accounts for the combobox. */
type PropertyItem = {
  accountId: string;
  propertyId: string;
  name: string;
  detail?: string;
  selectable: boolean;
};

/** One account's properties, the combobox's grouping unit. */
type PropertyGroup = {
  accountId: string;
  label: string;
  status?: string;
  items: PropertyItem[];
};

function accountLabel(account: GooglePickerAccount) {
  return account.email ?? `Google account · ${account.accountId.slice(-6)}`;
}

function accountStatus(account: GooglePickerAccount): string | undefined {
  if (account.requiresReconnect) return "connection expired";
  if (account.unavailable) return "couldn't load properties";
  return undefined;
}

function matchesProperty(item: PropertyItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${item.name} ${item.detail ?? ""}`.toLowerCase().includes(needle);
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
  renderActions?: (saveButton: ReactNode) => ReactNode;
}) {
  const [removing, setRemoving] = useState<GooglePickerAccount | null>(null);
  const groups: PropertyGroup[] = accounts
    .map((account) => {
      const label = accountLabel(account);
      const status = accountStatus(account);
      return {
        accountId: account.accountId,
        label,
        status,
        items: account.properties.map((property) => ({
          accountId: account.accountId,
          propertyId: property.id,
          name: property.name,
          detail: property.detail,
          // A property on a dead or unreachable account cannot be selected.
          selectable:
            property.selectable &&
            !account.requiresReconnect &&
            !account.unavailable,
        })),
      };
    })
    // An account with nothing loadable still belongs in the account list below,
    // but an empty group would render a bare label in the dropdown.
    .filter((group) => group.items.length > 0);
  const items = groups.flatMap((group) => group.items);
  const selected =
    items.find(
      (item) =>
        item.accountId === selection?.accountId &&
        item.propertyId === selection?.propertyId,
    ) ?? null;
  const canSave = Boolean(selected?.selectable) && !loading && !error;
  const saveButton = readOnly ? null : (
    <Button size="sm" onClick={onSave} disabled={!canSave || saving}>
      {saving ? "Saving…" : saveLabel}
    </Button>
  );

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
      <div>
        <p className="mb-2 text-sm font-medium">
          {readOnly ? "Manage Google accounts" : "Choose property"}
        </p>
        {loading ? (
          <Spinner size="sm" label="Loading properties…" className="py-2" />
        ) : error ? (
          <QueryError fallback="Couldn't load properties." onRetry={onRetry} />
        ) : (
          <Combobox
            items={groups}
            value={selected}
            itemToStringLabel={(item) => item.name}
            filter={matchesProperty}
            autoHighlight
            onValueChange={(item) => {
              if (item) {
                onSelect({
                  accountId: item.accountId,
                  propertyId: item.propertyId,
                });
              }
            }}
          >
            <ComboboxInput
              className="w-full"
              placeholder="Search properties or accounts…"
              disabled={readOnly || saving}
            />
            <ComboboxContent>
              <ComboboxEmpty>
                {items.length === 0
                  ? "No properties available. Add a Google account below."
                  : "No matching properties or accounts."}
              </ComboboxEmpty>
              <ComboboxList>
                {(group: PropertyGroup) => (
                  <ComboboxGroup key={group.accountId} items={group.items}>
                    <ComboboxLabel>
                      {group.label}
                      {group.status ? ` · ${group.status}` : ""}
                    </ComboboxLabel>
                    <ComboboxCollection>
                      {(item: PropertyItem) => (
                        <ComboboxItem
                          key={`${item.accountId}:${item.propertyId}`}
                          value={item}
                          disabled={readOnly || !item.selectable}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{item.name}</span>
                            {item.detail ? (
                              <span className="block text-xs text-muted-foreground">
                                {item.detail}
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

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Accounts</p>
        {accounts.map((account) => (
          <div
            key={account.accountId}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              {accountLabel(account)}
              {account.requiresReconnect
                ? " · connection expired"
                : account.unavailable
                  ? " · couldn't load properties"
                  : ""}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {account.requiresReconnect ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={onReconnect}
                  disabled={linking}
                  aria-busy={linking}
                >
                  {linking ? "Opening Google…" : "Reconnect"}
                </Button>
              ) : account.unavailable ? (
                <Button variant="ghost" size="xs" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive"
                disabled={saving}
                onClick={() => setRemoving(account)}
                aria-label={`Remove ${accountLabel(account)}`}
              >
                Remove
              </Button>
            </span>
          </div>
        ))}
        <Button
          variant="ghost"
          size="xs"
          className="justify-start px-0"
          onClick={onReconnect}
          disabled={saving || linking}
          pending={linking}
        >
          {linking ? null : <Plus className="size-4" />}
          {linking ? "Opening Google…" : "Add Google account"}
        </Button>
      </div>

      {renderActions ? (
        renderActions(saveButton)
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {saveButton}
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
