import type { ReactNode } from "react";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import {
  ChevronDown,
  Copy,
  Download,
  FileDown,
  MoreHorizontal,
  Play,
  RefreshCw,
  Sheet,
} from "lucide-react";

function ToolbarMenu({
  label,
  icon,
  title,
  children,
}: {
  label?: string;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={label ? "sm" : "icon"}
            className={label ? "gap-1" : "size-8"}
            title={title}
            aria-label={title ?? label}
          />
        }
      >
        {icon}
        {label}
        {label && <ChevronDown className="size-3.5 opacity-60" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[230px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem
      className="items-start"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex flex-col items-start text-left">
        <span>{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </DropdownMenuItem>
  );
}

export function MoreMenu({
  onCheckNow,
  checkBusy,
  checkDisabled,
  onRefreshMetrics,
  metricsRefreshing,
  hasData,
}: {
  onCheckNow: () => void;
  checkBusy: boolean;
  checkDisabled: boolean;
  onRefreshMetrics: () => void;
  metricsRefreshing: boolean;
  hasData: boolean;
}) {
  return (
    <ToolbarMenu
      icon={<MoreHorizontal className="size-4" />}
      title="More actions"
    >
      {!checkDisabled && (
        <MenuItem
          icon={<Play className="size-3.5" />}
          label={checkBusy ? "Running..." : "Check rankings"}
          description="Fetch current Google positions"
          onClick={onCheckNow}
          disabled={checkBusy}
        />
      )}
      <MenuItem
        icon={
          <RefreshCw
            className={`size-3.5 ${metricsRefreshing ? "animate-spin" : ""}`}
          />
        }
        label={metricsRefreshing ? "Refreshing..." : "Update keyword stats"}
        description="Volume, difficulty & CPC — not rankings"
        onClick={onRefreshMetrics}
        disabled={metricsRefreshing || !hasData}
      />
    </ToolbarMenu>
  );
}

export function ExportMenu({
  onExport,
  onExportToSheets,
  onCopyKeywords,
  hasData,
}: {
  onExport: () => void;
  onExportToSheets: () => void;
  onCopyKeywords: () => void;
  hasData: boolean;
}) {
  return (
    <ToolbarMenu label="Export" icon={<Download className="size-3.5" />}>
      <MenuItem
        icon={<Sheet className="size-3.5" />}
        label="Export to Sheets"
        onClick={onExportToSheets}
        disabled={!hasData}
      />
      <MenuItem
        icon={<FileDown className="size-3.5" />}
        label="Export CSV"
        onClick={onExport}
        disabled={!hasData}
      />
      <MenuItem
        icon={<Copy className="size-3.5" />}
        label="Copy keywords"
        onClick={onCopyKeywords}
        disabled={!hasData}
      />
    </ToolbarMenu>
  );
}
