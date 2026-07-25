import * as React from "react";

/**
 * Chrome shared by the integration connection cards (Search Console, Bing).
 * Only the pieces that were byte-identical live here — the card bodies stay
 * per-integration, because their connect flows, setup warnings, and cache
 * invalidation genuinely differ.
 */

type IntegrationStatus = "connected" | "disconnected" | "setup_required";

export function IntegrationCard({
  title,
  status,
  children,
}: {
  title: string;
  status?: IntegrationStatus;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {status ? <StatusPill status={status} /> : null}
      </div>
      <div className="border-t border-base-300 p-5 sm:p-6">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: IntegrationStatus }) {
  const connected = status === "connected";
  const setupRequired = status === "setup_required";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        connected
          ? "border-success/30 bg-success/10 text-success"
          : setupRequired
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-base-300 bg-base-200 text-base-content/60",
      ].join(" ")}
    >
      <span
        className={[
          "size-1.5 rounded-full",
          connected
            ? "bg-success"
            : setupRequired
              ? "bg-warning"
              : "bg-base-content/40",
        ].join(" ")}
      />
      {connected
        ? "Connected"
        : setupRequired
          ? "Setup required"
          : "Not connected"}
    </span>
  );
}

/** The connected-and-idle state: which site/property is bound, who connected
 *  it, and the change/disconnect actions. `changeLabel` differs per integration
 *  because Google calls them properties and Bing calls them sites. */
export function ConnectedState({
  glyph,
  changeLabel,
  siteUrl,
  connectedByEmail,
  onChange,
  onDisconnect,
  disconnecting,
}: {
  glyph: React.ReactNode;
  changeLabel: string;
  siteUrl: string;
  connectedByEmail: string | null;
  onChange: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/40 p-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-md border border-base-300 bg-base-100">
          {glyph}
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm">{siteUrl}</p>
          {connectedByEmail ? (
            <p className="truncate text-xs text-base-content/55">
              Connected by {connectedByEmail}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onChange}
        >
          {changeLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-error hover:bg-error/10"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
