import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  DollarSign,
  Loader2,
  Server,
  ShieldAlert,
} from "lucide-react";
import type { GlobalTraceOperation } from "@/shared/globalTraceTypes";
import { formatTraceDuration } from "./globalTraceFormat";
import {
  BillingSection,
  ChildrenSection,
  ProviderSection,
  ScopeSection,
} from "./GlobalTraceOperationCardSections";

function StatusBadge({ status }: { status: GlobalTraceOperation["status"] }) {
  const badgeClasses = {
    running: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    failed: "bg-error/15 text-error",
    blocked: "bg-warning/15 text-warning",
  }[status];

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${badgeClasses}`}
    >
      {status}
    </span>
  );
}

function StatusIcon({ status }: { status: GlobalTraceOperation["status"] }) {
  if (status === "running") {
    return <Loader2 className="size-4 animate-spin text-primary" />;
  }
  if (status === "success") {
    return <Check className="size-4 text-success" />;
  }
  if (status === "failed") {
    return <AlertTriangle className="size-4 text-error" />;
  }
  return <ShieldAlert className="size-4 text-warning" />;
}

function CardSummary({ operation }: { operation: GlobalTraceOperation }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/70">
      {operation.scope && (
        <span>
          <strong className="font-medium text-base-content">
            {operation.scope === "selected" ? "Selected" : "All"}
          </strong>
          {operation.selectedCount !== undefined && (
            <span>
              : {operation.selectedCount} requested
              {operation.validatedCount !== undefined &&
                ` · ${operation.validatedCount} validated`}
            </span>
          )}
        </span>
      )}

      {operation.provider && (
        <span className="flex items-center gap-1 font-mono text-base-content/80">
          <Server className="size-3" />
          {operation.provider}
        </span>
      )}

      {operation.httpStatus && (
        <span className="font-mono font-medium">
          HTTP {operation.httpStatus}
        </span>
      )}

      {operation.cache && (
        <span className="flex items-center gap-0.5 text-xs">
          <Database className="size-3" />
          Cache: {operation.cache}
        </span>
      )}

      {operation.billing && (
        <span className="flex items-center gap-0.5 text-xs">
          <DollarSign className="size-3" />
          {operation.billing}
        </span>
      )}

      {operation.budget && (
        <span
          className={`font-semibold ${
            operation.budget === "BLOCKED"
              ? "text-warning"
              : "text-base-content/70"
          }`}
        >
          Budget: {operation.budget}
        </span>
      )}
    </div>
  );
}

function CacheRetrySection({ operation }: { operation: GlobalTraceOperation }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div className="rounded border border-base-200 bg-base-100 p-2">
        <div className="text-base-content/60">Cache</div>
        <div className="font-semibold text-base-content">
          {operation.cache ?? "Not applicable"}
          {operation.cacheType && ` (${operation.cacheType})`}
        </div>
      </div>
      <div className="rounded border border-base-200 bg-base-100 p-2">
        <div className="text-base-content/60">Retry</div>
        <div className="font-semibold text-base-content">
          {operation.retry?.attempted ? `YES ×${operation.retry.count}` : "NO"}
        </div>
      </div>
      <div className="rounded border border-base-200 bg-base-100 p-2">
        <div className="text-base-content/60">Operation ID</div>
        <div className="truncate font-mono text-[11px] text-base-content/70">
          {operation.operationId}
        </div>
      </div>
      <div className="rounded border border-base-200 bg-base-100 p-2">
        <div className="text-base-content/60">Trace ID</div>
        <div className="truncate font-mono text-[11px] text-base-content/70">
          {operation.traceId}
        </div>
      </div>
    </div>
  );
}

export function GlobalTraceOperationCard({
  operation,
}: {
  operation: GlobalTraceOperation;
}) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = operation.status === "running";
  const isBlocked = operation.status === "blocked";
  const isFailed = operation.status === "failed";

  const cardBorder = isFailed
    ? "border-error/40"
    : isBlocked
      ? "border-warning/40"
      : isRunning
        ? "border-primary/40 shadow-sm"
        : "border-base-300 hover:border-base-content/20";

  return (
    <div className={`rounded-lg border bg-base-100 text-sm transition-colors ${cardBorder}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-start justify-between gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5">
            <StatusIcon status={operation.status} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium text-base-content">
                {operation.operation}
              </span>
              <span className="rounded bg-base-200 px-1.5 py-0.5 text-xs text-base-content/60">
                {operation.source}
              </span>
              <StatusBadge status={operation.status} />
            </div>
            <CardSummary operation={operation} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-base-content/60">
            {formatTraceDuration(operation.durationMs)}
          </span>
          {expanded ? (
            <ChevronDown className="size-4 text-base-content/40" />
          ) : (
            <ChevronRight className="size-4 text-base-content/40" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-base-200 bg-base-200/30 p-3.5">
          <ScopeSection operation={operation} />
          <ProviderSection operation={operation} />
          <BillingSection operation={operation} />
          <CacheRetrySection operation={operation} />

          {(operation.errorClass || operation.errorMessage) && (
            <div className="space-y-1 rounded border border-error/30 bg-error/10 p-2.5 text-xs text-error">
              <div className="font-semibold">
                Error: {operation.errorClass ?? "RUNTIME_ERROR"}
              </div>
              {operation.errorMessage && (
                <div className="font-mono text-[11px] text-error/90">
                  {operation.errorMessage}
                </div>
              )}
            </div>
          )}

          {operation.children && operation.children.length > 0 && (
            <ChildrenSection items={operation.children} />
          )}
        </div>
      )}
    </div>
  );
}
