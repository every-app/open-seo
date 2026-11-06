import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/client/components/ui/popover";
import { GSC_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/gsc";
import type { GooglePickerAccount } from "./GooglePropertyPicker";

type AccountsProps = {
  accounts: GooglePickerAccount[];
  provider: "gsc" | "ga4";
  loading: boolean;
  linking: boolean;
  saving: boolean;
  onReconnect: () => void;
  onRetry: () => void;
  onRemove: (account: GooglePickerAccount) => void;
};

export function accountLabel(account: GooglePickerAccount) {
  return account.email ?? `Google account · ${account.accountId.slice(-6)}`;
}

export function accountStatus(
  account: GooglePickerAccount,
  provider: "gsc" | "ga4",
) {
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

function needsAttention(account: GooglePickerAccount) {
  return account.requiresReconnect || Boolean(account.unavailable);
}

/**
 * The Google accounts under the property field. People rarely manage them,
 * so the list sits behind a one-line popover trigger. Accounts that need a
 * reconnect or retry stay in view, since they explain missing properties.
 * `inline` shows the whole list, for viewers who can only manage accounts.
 */
export function GoogleAccounts({
  inline,
  ...props
}: AccountsProps & { inline: boolean }) {
  const [open, setOpen] = useState(false);
  if (inline) return <AccountList {...props} />;
  if (props.accounts.length === 0) return <AddAccountButton {...props} />;
  return (
    <div className="space-y-1">
      {props.loading
        ? null
        : props.accounts
            .filter(needsAttention)
            .map((account) => (
              <AccountRow
                key={account.accountId}
                {...props}
                account={account}
                onRemove={undefined}
              />
            ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="-ml-2 max-w-full text-muted-foreground"
            />
          }
        >
          <span className="truncate">
            {props.accounts.length === 1
              ? accountLabel(props.accounts[0])
              : `${props.accounts.length} Google accounts`}
          </span>
          <ChevronDown className="size-3.5 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Google accounts</PopoverTitle>
            <PopoverDescription>
              Properties come from these accounts.
            </PopoverDescription>
          </PopoverHeader>
          <AccountList
            {...props}
            onRemove={(account) => {
              setOpen(false);
              props.onRemove(account);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AccountList(props: AccountsProps) {
  return (
    <div className="space-y-1">
      {props.accounts.map((account) => (
        <AccountRow
          key={account.accountId}
          {...props}
          account={account}
          onRemove={() => props.onRemove(account)}
        />
      ))}
      <AddAccountButton {...props} />
    </div>
  );
}

function AddAccountButton({
  linking,
  saving,
  onReconnect,
}: Pick<AccountsProps, "linking" | "saving" | "onReconnect">) {
  return (
    <div>
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
    </div>
  );
}

function AccountRow({
  account,
  provider,
  loading,
  linking,
  saving,
  onReconnect,
  onRetry,
  onRemove,
}: Omit<AccountsProps, "accounts" | "onRemove"> & {
  account: GooglePickerAccount;
  onRemove?: () => void;
}) {
  const label = accountLabel(account);
  const status = loading ? null : accountStatus(account, provider);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
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
        {onRemove ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-destructive"
            disabled={saving}
            onClick={onRemove}
            aria-label={`Remove ${label}`}
          >
            Remove
          </Button>
        ) : null}
      </span>
    </div>
  );
}
