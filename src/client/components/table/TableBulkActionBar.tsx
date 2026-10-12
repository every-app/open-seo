import { Download, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";

export function TableBulkActionBar({
  selectedCount,
  selectedLabel = "selected",
  actions,
  onClear,
}: {
  selectedCount: number;
  selectedLabel?: string;
  actions: ReactNode;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="pointer-events-auto flex items-stretch rounded-xl border border-border bg-popover/90 text-popover-foreground shadow-2xl backdrop-blur"
      >
        <div className="flex items-center gap-2 border-r border-border py-2 pr-3 pl-2 text-sm">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear selection"
            className="text-muted-foreground"
            onClick={onClear}
          >
            <X />
          </Button>
          <span className="font-medium tabular-nums">{selectedCount}</span>
          <span className="text-muted-foreground">{selectedLabel}</span>
        </div>
        {actions}
      </div>
    </div>
  );
}

export function TableBulkActionButton({
  icon,
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={
        variant === "danger"
          ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
          : undefined
      }
    >
      {icon}
      {children}
    </Button>
  );
}

export function TableBulkExportMenu({
  actions,
  busy,
}: {
  actions: Array<{
    label: ReactNode;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
  busy?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" pending={busy} />}
      >
        {busy ? null : <Download data-icon="inline-start" />}
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-52">
        {actions.map((action, index) => (
          <DropdownMenuItem
            key={index}
            onClick={action.onClick}
            disabled={busy || action.disabled}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
