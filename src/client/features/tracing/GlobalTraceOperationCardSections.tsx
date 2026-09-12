import type {
  GlobalTraceKeywordChild,
  GlobalTraceOperation,
} from "@/shared/globalTraceTypes";
import { formatTraceDuration } from "./globalTraceFormat";

export function ScopeSection({
  operation,
}: {
  operation: GlobalTraceOperation;
}) {
  const hasScope =
    operation.scope ||
    operation.selectedCount !== undefined ||
    operation.validatedCount !== undefined;

  if (!hasScope) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
        Scope & Keywords
      </h4>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Scope</div>
          <div className="font-semibold capitalize text-base-content">
            {operation.scope ?? "Standard"}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Selected</div>
          <div className="font-mono font-semibold text-base-content">
            {operation.selectedCount ?? 0}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Validated</div>
          <div className="font-mono font-semibold text-base-content">
            {operation.validatedCount ?? 0}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Checks Started</div>
          <div className="font-mono font-semibold text-base-content">
            {operation.rankChecksStarted ?? operation.validatedCount ?? 0}
          </div>
        </div>
      </div>

      {(operation.rankChecksSucceeded !== undefined ||
        operation.rankChecksFailed !== undefined ||
        operation.rankChecksSkipped !== undefined) && (
        <div className="flex flex-wrap gap-3 pt-1 text-xs">
          {operation.rankChecksSucceeded !== undefined && (
            <span className="font-medium text-success">
              ✓ {operation.rankChecksSucceeded} succeeded
            </span>
          )}
          {operation.rankChecksFailed !== undefined &&
            operation.rankChecksFailed > 0 && (
              <span className="font-medium text-error">
                ✗ {operation.rankChecksFailed} failed
              </span>
            )}
          {operation.rankChecksSkipped !== undefined &&
            operation.rankChecksSkipped > 0 && (
              <span className="text-base-content/60">
                {operation.rankChecksSkipped} unselected / skipped
              </span>
            )}
        </div>
      )}

      {operation.selectedKeywordIds &&
        operation.selectedKeywordIds.length > 0 && (
          <div className="pt-1">
            <span className="text-[11px] text-base-content/60">
              Validated Keyword IDs ({operation.selectedKeywordIds.length}):
            </span>
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-[11px]">
              {operation.selectedKeywordIds.map((id) => (
                <span
                  key={id}
                  className="rounded border border-base-300 bg-base-200 px-1.5 py-0.5"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

export function ProviderSection({
  operation,
}: {
  operation: GlobalTraceOperation;
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
        Provider & Network
      </h4>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Provider Calls</div>
          <div className="font-mono font-semibold text-base-content">
            {operation.providerCalls ?? operation.providers?.length ?? 0}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Providers</div>
          <div className="font-mono font-semibold text-base-content">
            {operation.provider || "None"}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">HTTP Status</div>
          <div className="font-mono font-semibold text-base-content">
            {operation.httpStatus ?? "N/A"}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Duration</div>
          <div className="font-mono font-semibold text-base-content">
            {formatTraceDuration(operation.durationMs)}
          </div>
        </div>
      </div>

      {operation.providers && operation.providers.length > 0 && (
        <div className="space-y-1 pt-1">
          {operation.providers.map((p, idx) => (
            <div
              key={`${p.provider}-${idx}`}
              className="flex flex-wrap items-center justify-between rounded border border-base-200 bg-base-100 px-2.5 py-1.5 font-mono text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base-content">
                  {p.provider}
                </span>
                {p.endpoint && (
                  <span className="text-base-content/60">{p.endpoint}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-base-content/70">
                {p.httpStatus && <span>HTTP {p.httpStatus}</span>}
                {p.taskStatus && <span>Task {p.taskStatus}</span>}
                {p.transport && <span>[{p.transport}]</span>}
                {p.durationMs !== undefined && (
                  <span>{formatTraceDuration(p.durationMs)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BillingSection({
  operation,
}: {
  operation: GlobalTraceOperation;
}) {
  const costDisplay =
    operation.cost !== undefined && operation.cost !== null
      ? typeof operation.cost === "number"
        ? `$${operation.cost.toFixed(4)}`
        : String(operation.cost)
      : "Not available";

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
        Billing & Budget
      </h4>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Billing</div>
          <div className="font-semibold text-base-content">
            {operation.billing ?? "Free"}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Metered</div>
          <div className="font-semibold text-base-content">
            {operation.metered ? "YES" : "NO"}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Budget Guard</div>
          <div
            className={`font-semibold ${
              operation.budget === "BLOCKED" ? "text-warning" : "text-success"
            }`}
          >
            {operation.budget ?? "PASS"}
          </div>
        </div>
        <div className="rounded border border-base-200 bg-base-100 p-2">
          <div className="text-base-content/60">Actual Cost</div>
          <div className="font-mono text-base-content">{costDisplay}</div>
        </div>
      </div>

      {operation.blockedReason && (
        <div className="rounded border border-warning/20 bg-warning/10 p-2 text-xs text-warning">
          <strong>Reason:</strong> {operation.blockedReason}
        </div>
      )}
    </div>
  );
}

export function ChildrenSection({
  items,
}: {
  items: GlobalTraceKeywordChild[];
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
        Per-Keyword Checks ({items.length})
      </h4>
      <div className="max-h-60 divide-y divide-base-200 overflow-y-auto rounded border border-base-200 bg-base-100">
        {items.map((child: GlobalTraceKeywordChild) => (
          <div
            key={child.keywordId}
            className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-base-content">
                {child.keyword ?? child.keywordId}
              </span>
              {child.keyword && (
                <span className="font-mono text-[11px] text-base-content/50">
                  ({child.keywordId})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {(child.positionBefore !== undefined ||
                child.positionAfter !== undefined) && (
                <span className="font-mono text-xs">
                  Pos:{" "}
                  {child.positionBefore !== null &&
                  child.positionBefore !== undefined
                    ? `#${child.positionBefore}`
                    : "—"}
                  {" → "}
                  {child.positionAfter !== null &&
                  child.positionAfter !== undefined
                    ? `#${child.positionAfter}`
                    : "—"}
                </span>
              )}

              {child.provider && (
                <span className="rounded bg-base-200 px-1 py-0.5 font-mono text-[11px]">
                  {child.provider}
                </span>
              )}

              <span
                className={`font-semibold uppercase text-[11px] ${
                  child.status === "success"
                    ? "text-success"
                    : child.status === "blocked"
                      ? "text-warning"
                      : "text-error"
                }`}
              >
                {child.status}
              </span>

              {child.durationMs !== undefined && (
                <span className="font-mono text-[11px] text-base-content/60">
                  {formatTraceDuration(child.durationMs)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
