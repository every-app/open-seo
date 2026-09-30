import type { ReactNode } from "react";
import { Badge } from "@/client/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";

type IntegrationConnectionStatus =
  | "connected"
  | "disconnected"
  | "setup_required";

/** Shared shell for first-party connection cards such as GSC and GA4. */
export function IntegrationConnectionCard({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon?: ReactNode;
  status?: IntegrationConnectionStatus;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-start justify-between gap-3 space-y-0 p-5 sm:flex-row sm:gap-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card">
              {icon}
            </span>
          ) : null}
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
        </div>
        {status ? <ConnectionStatusPill status={status} /> : null}
      </CardHeader>
      <CardContent className="border-t border-border p-5 sm:p-6">
        {children}
      </CardContent>
    </Card>
  );
}

function ConnectionStatusPill({
  status,
}: {
  status: IntegrationConnectionStatus;
}) {
  const connected = status === "connected";
  const setupRequired = status === "setup_required";
  return (
    <Badge
      size="lg"
      variant={connected ? "success" : setupRequired ? "warning" : "secondary"}
      className="shrink-0"
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {connected
        ? "Connected"
        : setupRequired
          ? "Setup required"
          : "Not connected"}
    </Badge>
  );
}
