import { useState, type ReactNode } from "react";
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
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className={`btn btn-ghost btn-sm ${label ? "gap-1" : "btn-square"}`}
        onClick={() => setOpen((c) => !c)}
        title={title}
        aria-label={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon}
        {label}
        {label && <ChevronDown className="size-3.5 opacity-60" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-base-300 bg-base-100 shadow-lg py-1 min-w-[230px]"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
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
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-start gap-2 px-3 py-2 text-sm hover:bg-base-200 disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex flex-col items-start text-left">
        <span>{label}</span>
        {description && (
          <span className="text-xs text-base-content/50">{description}</span>
        )}
      </span>
    </button>
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
    <ToolbarMenu icon={<MoreHorizontal className="size-4" />} title="更多操作">
      {!checkDisabled && (
        <MenuItem
          icon={<Play className="size-3.5" />}
          label={checkBusy ? "运行中…" : "检查排名"}
          description="获取当前 Google 排名"
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
        label={metricsRefreshing ? "刷新中…" : "更新关键词数据"}
        description="更新搜索量、难度和 CPC，不更新排名"
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
    <ToolbarMenu label="导出" icon={<Download className="size-3.5" />}>
      <MenuItem
        icon={<Sheet className="size-3.5" />}
        label="导出到 Google 表格"
        onClick={onExportToSheets}
        disabled={!hasData}
      />
      <MenuItem
        icon={<FileDown className="size-3.5" />}
        label="导出 CSV"
        onClick={onExport}
        disabled={!hasData}
      />
      <MenuItem
        icon={<Copy className="size-3.5" />}
        label="复制关键词"
        onClick={onCopyKeywords}
        disabled={!hasData}
      />
    </ToolbarMenu>
  );
}
