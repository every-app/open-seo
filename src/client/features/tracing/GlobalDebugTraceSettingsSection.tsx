import { Bug, ExternalLink } from "lucide-react";
import { useGlobalTrace } from "./globalTraceStore";
import { GlobalDebugTracePanel } from "./GlobalDebugTracePanel";

export function GlobalDebugTraceSettingsSection({
  projectId,
}: {
  projectId?: string;
}) {
  const {
    diagnosticsEnabled,
    setDiagnosticsEnabled,
    totalCount,
    panelOpen,
    setPanelOpen,
  } = useGlobalTrace(projectId);

  return (
    <>
      <div className="rounded-xl border border-base-300 bg-base-100 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bug className="size-4 text-primary" />
              <h3 className="text-base font-semibold text-base-content">
                Debug Trace
              </h3>
            </div>
            <p className="mt-1 text-sm text-base-content/60">
              Developer diagnostics for OpenSEO operations (rank tracking, data provider, keyword research, SEO services)
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="btn btn-outline btn-sm gap-1.5 shrink-0"
          >
            <ExternalLink className="size-3.5" />
            Open Debug Trace
            {totalCount > 0 && (
              <span className="badge badge-sm badge-primary">
                {totalCount}
              </span>
            )}
          </button>
        </div>

        <div className="divider my-1" />

        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-medium text-base-content">
              Enable diagnostics
            </span>
            <p className="text-xs text-base-content/60">
              Captures runtime execution details, provider calls, HTTP status codes, and scope breakdown.
            </p>
          </div>

          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={diagnosticsEnabled}
            onChange={(e) => setDiagnosticsEnabled(e.target.checked)}
            aria-label="Enable diagnostics"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-base-content/50 border-t border-base-200">
          <span>Session retention: Current session</span>
          <span>Max events: 500</span>
        </div>
      </div>

      {panelOpen && (
        <GlobalDebugTracePanel
          projectId={projectId}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  );
}
