import { ChevronDown, Download, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/client/components/ui/button";
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
  placement = "fixed",
}: {
  selectedCount: number;
  selectedLabel?: string;
  actions: ReactNode;
  onClear: () => void;
  placement?: "fixed" | "inline";
}) {
  if (selectedCount === 0) return null;

  const wrapperClass =
    placement === "fixed"
      ? "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
      : "flex justify-center";
  const toolbarClass =
    placement === "fixed"
      ? "pointer-events-auto flex items-stretch overflow-visible rounded-xl border border-foreground/15 bg-border/85 shadow-2xl backdrop-blur"
      : "flex items-stretch overflow-visible rounded-xl border border-foreground/15 bg-muted";

  return (
    <div className={wrapperClass}>
      <div role="toolbar" aria-label="Bulk actions" className={toolbarClass}>
        <div className="flex items-center gap-2 border-r border-foreground/10 px-3 py-2 text-sm">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear selection"
            className="-ml-1 size-6"
            onClick={onClear}
          >
            <X className="size-3.5" />
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
      className={`my-1 gap-1.5 ${
        variant === "danger"
          ? "text-destructive hover:text-destructive"
          : "text-foreground"
      }`}
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
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            className="my-1 gap-1.5 text-foreground"
          />
        }
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        Export
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52">
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

export function TableExportMenu({
  actions,
  buttonVariant = "outline",
  menuClassName = "w-56",
}: {
  actions: Array<{
    label: ReactNode;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
  buttonVariant?: ButtonProps["variant"];
  menuClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={buttonVariant} size="sm" className="gap-1" />}
      >
        <Download className="size-4" />
        Export
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuClassName}>
        {actions.map((action, index) => (
          <DropdownMenuItem
            key={index}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
