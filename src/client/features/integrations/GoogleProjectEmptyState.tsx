import type { ReactNode } from "react";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";

import { Spinner } from "@/client/components/ui/spinner";
import { Button } from "@/client/components/ui/button";
export function GoogleProjectEmptyState({
  name,
  hasGrant,
  disabled,
  canManage,
  onChoose,
  onLink,
  children,
}: {
  name: string;
  hasGrant: boolean;
  disabled: boolean;
  canManage: boolean;
  onChoose: () => void;
  onLink: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {hasGrant
          ? `Choose a ${name} property to finish connecting this project.`
          : `Connect ${name} to see this project’s data.`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {canManage || hasGrant ? (
          <Button
            variant="outline"
            onClick={hasGrant ? onChoose : onLink}
            disabled={disabled}
            aria-busy={disabled}
            className="h-auto inline-flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm transition hover:bg-muted disabled:opacity-50"
          >
            {disabled ? (
              <Spinner size="sm" className="[&_svg]:size-3" />
            ) : (
              !hasGrant && <GoogleGlyph className="size-[18px]" />
            )}
            {disabled
              ? "Opening Google…"
              : canManage
                ? hasGrant
                  ? "Choose property"
                  : "Connect"
                : "Manage Google accounts"}
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
