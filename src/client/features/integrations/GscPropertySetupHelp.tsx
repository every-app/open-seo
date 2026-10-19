import { Button } from "@/client/components/ui/button";
import { QueryError } from "@/client/components/QueryState";
import type { GooglePickerAccount } from "./GooglePropertyPicker";

export function GscPropertySetupHelp({
  accounts,
  emptyGsc,
  loading,
  error,
  busy,
  linking,
  onRetry,
  onReconnect,
}: {
  accounts: GooglePickerAccount[];
  emptyGsc: boolean;
  loading: boolean;
  error: boolean;
  busy: boolean;
  linking: boolean;
  onRetry: () => void;
  onReconnect: () => void;
}) {
  if (!emptyGsc && !error) return null;

  return (
    <>
      {emptyGsc ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <h2 className="font-semibold">We couldn’t find your website</h2>
          <p className="break-words text-muted-foreground">
            We checked{" "}
            {accounts
              .map(
                (account) =>
                  account.email ??
                  `Google account · ${account.accountId.slice(-6)}`,
              )
              .join(", ")}
            .
          </p>
          <p className="text-muted-foreground">
            Add your site to Search Console, or ask whoever manages it to give
            {accounts.length === 1
              ? " this account"
              : " one of these accounts"}{" "}
            access.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a
              href="https://search.google.com/search-console"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Open Search Console ↗
            </a>
            <a
              href="https://openseo.so/blogs/google-search-console-setup"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Setup guide
            </a>
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        {error ? (
          <QueryError
            fallback="Couldn't load Search Console websites."
            onRetry={onRetry}
          />
        ) : null}
        {emptyGsc ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={loading || busy}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onReconnect}
              disabled={loading || busy}
              pending={linking}
            >
              {linking ? "Opening Google…" : "Use a different Google account"}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function EmptyAccountMessage({
  provider,
  filtered,
}: {
  provider: "gsc" | "ga4";
  filtered: boolean;
}) {
  return (
    <>
      {filtered ? (
        "No matching properties in this account"
      ) : provider === "gsc" ? (
        <>
          No websites found for this account.{" "}
          <a
            href="https://openseo.so/blogs/google-search-console-setup"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            Add a website or get access
          </a>
          , then refresh the list.
        </>
      ) : (
        "No properties available"
      )}
    </>
  );
}

export function hasNoGscWebsites(
  accounts: GooglePickerAccount[],
  loading: boolean,
  error: boolean,
) {
  return (
    !loading &&
    !error &&
    accounts.length > 0 &&
    accounts.every(
      (account) =>
        !account.requiresReconnect &&
        !account.unavailable &&
        account.properties.length === 0,
    )
  );
}
