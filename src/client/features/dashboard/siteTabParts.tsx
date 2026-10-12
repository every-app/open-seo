import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { safeHttpUrl } from "@/shared/safe-url";
export function Freshness({
  stale,
  refreshError,
}: {
  fetchedAt: string;
  stale: boolean;
  refreshError: string | null;
}) {
  if (!stale && !refreshError) return null;
  return (
    <p role="status" className="text-xs text-muted-foreground">
      Showing saved results
      {refreshError
        ? ` · ${getStandardErrorMessage(new Error(refreshError), "Could not update. Showing saved results.")}`
        : ""}
      {refreshError === "INSUFFICIENT_CREDITS" ? (
        <Link to="/billing" className="ml-2 text-primary underline">
          Add credits
        </Link>
      ) : null}
    </p>
  );
}

export function ExternalPage({
  url,
  label,
}: {
  url: string | null;
  label?: string | null;
}) {
  const href = safeHttpUrl(url);
  return href ? (
    <a
      className="block max-w-80 truncate text-primary hover:underline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={url ?? undefined}
    >
      {label || url}
    </a>
  ) : (
    <span>{label || "—"}</span>
  );
}

export function DashboardInfo({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Info className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="z-50">
          <Popover.Popup className="max-w-xs rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
