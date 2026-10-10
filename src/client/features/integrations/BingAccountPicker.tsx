import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/Spinner";
import { QueryError } from "@/client/components/QueryState";
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
import { Plus } from "lucide-react";
import type { listBingSites } from "@/serverFunctions/bing";

type BingAccount = Awaited<
  ReturnType<typeof listBingSites>
>["accounts"][number];

export type BingPickerSelection = {
  // Null selects the connector's delegated OAuth grant.
  credentialId: string | null;
  siteUrl: string;
};

/** One selectable site, flattened across accounts for the combobox. */
type SiteItem = {
  credentialId: string | null;
  siteUrl: string;
  name: string;
  selectable: boolean;
};

/** One account's sites, the combobox's grouping unit. */
type SiteGroup = {
  key: string;
  label: string;
  status?: string;
  items: SiteItem[];
};

/** Null marks the delegated OAuth grant, which Bing never names. */
function bingAccountLabel(keyLast4: string | null): string {
  return keyLast4 ? `Bing account · ${keyLast4}` : "Bing account · OAuth";
}

function accountStatus(account: BingAccount): string | undefined {
  if (account.requiresReconnect) return "connection expired";
  if (account.unavailable) return "couldn't load properties";
  return undefined;
}

function matchesSite(item: SiteItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return item.name.toLowerCase().includes(needle);
}

/** Compare by identity, not reference: a refetch can hand back a fresh item
 *  object for the same site, which `Object.is` would read as a change. */
function sameSite(a: SiteItem, b: SiteItem): boolean {
  return a.credentialId === b.credentialId && a.siteUrl === b.siteUrl;
}

/** The Bing account/site picker: a searchable, account-grouped site list plus
 *  add/remove. Mirrors the Google property picker so the two read the same. */
export function BingAccountPicker({
  accounts,
  loading,
  isError,
  onRetry,
  selection,
  onSelect,
  onSave,
  saving,
  onAddAccount,
  onRemoveAccount,
  onCancel,
}: {
  accounts: BingAccount[];
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  selection: BingPickerSelection | null;
  onSelect: (selection: BingPickerSelection) => void;
  onSave: () => void;
  saving: boolean;
  onAddAccount: () => void;
  onRemoveAccount: (credentialId: string | null) => void;
  /** Shown only when a project is already connected (change flow). */
  onCancel?: () => void;
}) {
  const groups: SiteGroup[] = accounts
    .map((account) => ({
      key: account.credentialId ?? "oauth",
      label: bingAccountLabel(account.keyLast4),
      status: accountStatus(account),
      items: account.sites.map((site) => ({
        credentialId: account.credentialId,
        siteUrl: site.url,
        name: site.url,
        selectable:
          site.selectable && !account.requiresReconnect && !account.unavailable,
      })),
    }))
    // An account with nothing loadable still belongs in the account list below,
    // but an empty group would render a bare label in the dropdown.
    .filter((group) => group.items.length > 0);
  const items = groups.flatMap((group) => group.items);
  const selected =
    items.find(
      (item) =>
        item.credentialId === selection?.credentialId &&
        item.siteUrl === selection?.siteUrl,
    ) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Choose property</p>
        {loading ? (
          <Spinner size="sm" label="Loading properties…" className="py-2" />
        ) : isError ? (
          <QueryError fallback="Couldn't load properties." onRetry={onRetry} />
        ) : (
          <Combobox
            items={groups}
            value={selected}
            itemToStringLabel={(item) => item.name}
            isItemEqualToValue={sameSite}
            filter={matchesSite}
            autoHighlight
            onValueChange={(item) => {
              if (item) {
                onSelect({
                  credentialId: item.credentialId,
                  siteUrl: item.siteUrl,
                });
              }
            }}
          >
            <ComboboxInput
              className="w-full"
              placeholder="Search properties or accounts…"
              disabled={saving}
            />
            <ComboboxContent>
              <ComboboxEmpty>
                {items.length === 0
                  ? "No verified properties available. Add a Bing account below."
                  : "No matching properties or accounts."}
              </ComboboxEmpty>
              <ComboboxList>
                {(group: SiteGroup) => (
                  <ComboboxGroup key={group.key} items={group.items}>
                    <ComboboxLabel>
                      {group.label}
                      {group.status ? ` · ${group.status}` : ""}
                    </ComboboxLabel>
                    <ComboboxCollection>
                      {(item: SiteItem) => (
                        <ComboboxItem
                          key={`${item.credentialId ?? "oauth"}:${item.siteUrl}`}
                          value={item}
                          disabled={saving || !item.selectable}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
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
        {accounts.map((account) => {
          const oauth = account.credentialId === null;
          return (
            <div
              key={account.credentialId ?? "oauth"}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {bingAccountLabel(account.keyLast4)}
                {account.requiresReconnect
                  ? " · connection expired"
                  : account.unavailable
                    ? " · couldn't load properties"
                    : ""}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {oauth && account.requiresReconnect ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={onAddAccount}
                    disabled={saving}
                  >
                    Reconnect
                  </Button>
                ) : account.unavailable ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={onRetry}
                    disabled={saving}
                  >
                    Try again
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  disabled={saving}
                  onClick={() => onRemoveAccount(account.credentialId)}
                >
                  {oauth ? "Disconnect" : "Remove"}
                </Button>
              </span>
            </div>
          );
        })}
        <Button
          variant="ghost"
          size="xs"
          className="justify-start px-0"
          onClick={onAddAccount}
          disabled={saving}
        >
          <Plus className="size-4" />
          Add Bing account
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !selected?.selectable}
          pending={saving}
        >
          Save property
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
