import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/client/components/EmptyState";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { Button } from "@/client/components/ui/button";

export function GoogleProjectEmptyState({
  name,
  pitch,
  hasGrant,
  disabled,
  canManage,
  onChoose,
  onLink,
  children,
}: {
  name: string;
  /** Sells the connection with the standard empty state, as on the dashboard. */
  pitch?: { icon: LucideIcon; title: string };
  hasGrant: boolean;
  disabled: boolean;
  canManage: boolean;
  onChoose: () => void;
  onLink: () => void;
  children?: ReactNode;
}) {
  const description = hasGrant
    ? `Choose a ${name} property to finish connecting this project.`
    : `Connect ${name} to see this project’s data.`;
  const label = disabled
    ? "Opening Google…"
    : canManage
      ? hasGrant
        ? "Choose property"
        : "Connect"
      : "Manage Google accounts";
  const canAct = canManage || hasGrant;
  const onClick = hasGrant ? onChoose : onLink;
  const showGlyph = !disabled && !hasGrant;

  if (pitch)
    return (
      <EmptyState
        variant="plain"
        icon={pitch.icon}
        title={pitch.title}
        description={description}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {canAct ? (
              <Button onClick={onClick} pending={disabled}>
                {showGlyph ? (
                  // The white chip keeps the brand colours readable on a primary
                  // button.
                  <span className="flex size-5 items-center justify-center rounded-full bg-white">
                    <GoogleGlyph className="size-3.5" />
                  </span>
                ) : null}
                {label}
              </Button>
            ) : null}
            {children}
          </div>
        }
      />
    );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-sm text-muted-foreground">{description}</p>
      {/* Actions sit bottom-right, with Dismiss (children) just left of the
          connect action. */}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-1">
        {children}
        {canAct ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onClick}
            pending={disabled}
          >
            {showGlyph ? <GoogleGlyph className="size-[18px]" /> : null}
            {label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
