import { GoogleAccountRemovalDialog } from "@/client/features/integrations/GoogleAccountRemovalDialog";
import { QueryError } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";

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

function accountLabel(account: GooglePickerAccount) {
  return account.email ?? `Google account · ${account.accountId.slice(-6)}`;
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
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<GooglePickerAccount | null>(null);
  const [search, setSearch] = useState("");
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedAccount = accounts.find(
    (a) => a.accountId === selection?.accountId,
  );
  const selected = selectedAccount?.properties.find(
    (p) => p.id === selection?.propertyId,
  );
  const canSave =
    selected?.selectable &&
    !selectedAccount?.requiresReconnect &&
    !selectedAccount?.unavailable &&
    !loading &&
    !error;
  const query = search.trim().toLowerCase();
  const filtered = accounts
    .map((account) => ({
      ...account,
      properties: account.properties.filter((property) =>
        `${account.email ?? ""} ${property.name} ${property.detail ?? ""} ${property.id}`
          .toLowerCase()
          .includes(query),
      ),
    }))
    .filter(
      (account) =>
        !query ||
        account.properties.length > 0 ||
        accountLabel(account).toLowerCase().includes(query),
    );
  const close = () => {
    setOpen(false);
    setSearch("");
    trigger.current?.focus();
  };
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
        <Button
          ref={trigger}
          variant="outline"
          aria-expanded={open}
          aria-controls={panelId}
          disabled={saving}
          className="h-auto w-full justify-between gap-3 px-3.5 py-3 text-left font-normal"
          onClick={() => {
            setOpen(!open);
            setSearch("");
          }}
        >
          <span className="min-w-0">
            <span className="block truncate">
              {selected?.name ?? "Select a property…"}
            </span>
            {selectedAccount ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {accountLabel(selectedAccount)}
              </span>
            ) : null}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
        {open ? (
          <div
            id={panelId}
            role="region"
            aria-label="Google properties"
            className="mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-sm"
            onKeyDown={(event) => handlePropertyKeyDown(event, close)}
          >
            <label className="flex items-center gap-2 border-b border-border px-3.5 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                autoFocus
                type="search"
                aria-label="Search properties or accounts"
                placeholder="Search properties or accounts…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-auto min-w-0 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              />
            </label>
            <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
              {loading ? (
                <Spinner
                  size="sm"
                  label="Loading properties…"
                  className="p-3"
                />
              ) : error ? (
                <QueryError
                  fallback="Couldn't load properties."
                  onRetry={onRetry}
                />
              ) : (
                <>
                  {filtered.map((account) => (
                    <div
                      key={account.accountId}
                      className="py-1"
                      role="group"
                      aria-label={accountLabel(account)}
                    >
                      <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs font-medium text-muted-foreground">
                        <span className="min-w-0 break-all">
                          {accountLabel(account)}
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="shrink-0 text-destructive"
                          disabled={saving}
                          onClick={() => setRemoving(account)}
                          aria-label={`Remove ${accountLabel(account)}`}
                        >
                          Remove account
                        </Button>
                      </div>
                      {account.requiresReconnect ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-sm">
                          <span className="text-muted-foreground">
                            Connection expired
                          </span>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={onReconnect}
                            aria-label={`Reconnect ${accountLabel(account)}`}
                            disabled={linking}
                            aria-busy={linking}
                          >
                            {linking ? "Opening Google…" : "Reconnect"}
                          </Button>
                        </div>
                      ) : account.unavailable ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-sm">
                          <span className="text-muted-foreground">
                            Couldn't load properties
                          </span>
                          <Button variant="ghost" size="xs" onClick={onRetry}>
                            Try again
                          </Button>
                        </div>
                      ) : account.properties.length === 0 ? (
                        <p className="px-2 pb-3 text-sm text-muted-foreground">
                          No properties available
                        </p>
                      ) : (
                        account.properties.map((property) => {
                          const chosen =
                            selection?.accountId === account.accountId &&
                            selection?.propertyId === property.id;
                          return (
                            <Button
                              key={property.id}
                              data-property
                              type="button"
                              variant="ghost"
                              aria-pressed={chosen}
                              disabled={
                                readOnly || !property.selectable || saving
                              }
                              className={`h-auto w-full justify-between gap-3 rounded-md px-2 py-2.5 text-left font-normal hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 ${chosen ? "bg-accent" : ""}`}
                              onClick={() => {
                                onSelect({
                                  accountId: account.accountId,
                                  propertyId: property.id,
                                });
                                close();
                              }}
                            >
                              <span className="min-w-0">
                                <span className="block break-words">
                                  {property.name}
                                </span>
                                {property.detail ? (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {property.detail}
                                  </span>
                                ) : null}
                                {!property.selectable ? (
                                  <span className="block text-xs">
                                    No verified access
                                  </span>
                                ) : null}
                              </span>
                              {chosen ? (
                                <Check className="size-4 shrink-0" />
                              ) : null}
                            </Button>
                          );
                        })
                      )}
                    </div>
                  ))}
                  {filtered.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      {query
                        ? "No matching properties or accounts"
                        : "Add a Google account to find properties."}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <div className="border-t border-border p-1.5">
              <Button
                variant="ghost"
                className="h-auto w-full justify-start px-2 py-2.5"
                onClick={onReconnect}
                disabled={saving || linking}
                pending={linking}
              >
                {linking ? null : <Plus className="size-4" />}
                {linking ? "Opening Google…" : "Add Google account"}
              </Button>
            </div>
          </div>
        ) : null}
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

function handlePropertyKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  close: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button[data-property]:not(:disabled)",
    ),
  );
  if (!buttons.length) return;
  event.preventDefault();
  const index = buttons.findIndex(
    (button) => button === document.activeElement,
  );
  const nextIndex =
    index < 0
      ? event.key === "ArrowDown"
        ? 0
        : buttons.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
        buttons.length;
  buttons[nextIndex]?.focus();
}
