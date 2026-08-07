import { Activity, AlertTriangle, Globe2 } from "lucide-react";
import type {
  WarRoomBingTelemetry,
  WarRoomIndexingTelemetry,
} from "@/serverFunctions/war-room";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2">
      <div className="text-xs text-base-content/50">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function TelemetryState({
  label,
  isLoading,
  isError,
}: {
  label: string;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-8 text-center text-sm text-base-content/40">
        Loading {label}…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-4 text-sm text-error">
        {label} could not be loaded.
      </div>
    );
  }
  return null;
}

export function IndexNowTelemetrySection({
  data,
  isLoading,
  isError,
}: {
  data: WarRoomIndexingTelemetry | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const state = !data ? (
    <TelemetryState
      label="IndexNow telemetry"
      isLoading={isLoading}
      isError={isError}
    />
  ) : null;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
        <Activity className="size-4" /> IndexNow telemetry
      </h2>
      {state ?? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Configured"
              value={data?.totals.configuredProjects ?? 0}
            />
            <Stat label="Enabled" value={data?.totals.enabledProjects ?? 0} />
            <Stat label="Succeeded" value={data?.totals.success ?? 0} />
            <Stat label="Failed" value={data?.totals.error ?? 0} />
          </div>
          <div className="divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100">
            {data?.projects.length ? (
              data.projects.map((project) => (
                <div
                  key={project.projectId}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{project.projectName}</span>
                      <span
                        className={`badge badge-sm ${
                          project.config?.enabled
                            ? "badge-success"
                            : project.config
                              ? "badge-ghost"
                              : "badge-warning"
                        }`}
                      >
                        {project.config
                          ? project.config.enabled
                            ? "Enabled"
                            : "Disabled"
                          : "Not configured"}
                      </span>
                    </div>
                    <div className="truncate text-xs text-base-content/50">
                      {project.config?.host ?? "No IndexNow host configured"}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-base-content/50">
                    {project.eventCounts.total} event
                    {project.eventCounts.total === 1 ? "" : "s"} ·{" "}
                    {project.eventCounts.pending} pending
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-base-content/40">
                No active projects found.
              </div>
            )}
          </div>
          {data?.recentEvents.length ? (
            <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
              <div className="border-b border-base-300 px-4 py-3 text-sm font-medium">
                Recent submission events
              </div>
              <div className="divide-y divide-base-300">
                {data.recentEvents.slice(0, 8).map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-4 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {event.projectName}
                      </div>
                      <div className="truncate font-mono text-base-content/50">
                        {event.url}
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-base-content/60">
                      {event.eventType}
                    </span>
                    <span
                      className={`badge badge-sm ${
                        event.status === "success"
                          ? "badge-success"
                          : event.status === "error"
                            ? "badge-error"
                            : "badge-warning"
                      }`}
                    >
                      {event.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function BingTelemetrySection({
  data,
  isLoading,
  isError,
}: {
  data: WarRoomBingTelemetry | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const issueCount =
    data?.projects.reduce(
      (total, project) => total + (project.crawlIssueCount ?? 0),
      0,
    ) ?? 0;
  const state = !data ? (
    <TelemetryState
      label="Bing telemetry"
      isLoading={isLoading}
      isError={isError}
    />
  ) : null;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
        <Globe2 className="size-4" /> Bing Webmaster telemetry
      </h2>
      {state ?? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Connected projects"
              value={data?.connectedProjects ?? 0}
            />
            <Stat label="Crawl issues" value={issueCount} />
          </div>
          <div className="space-y-2">
            {data?.projects.length ? (
              data.projects.map((project) => (
                <div
                  key={project.projectId}
                  className="rounded-lg border border-base-300 bg-base-100 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-medium">{project.projectName}</span>
                      <span
                        className={`badge badge-sm ${
                          project.connected ? "badge-success" : "badge-ghost"
                        }`}
                      >
                        {project.connected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                    {project.connectedAt && (
                      <span className="text-xs text-base-content/50">
                        Connected {formatDate(project.connectedAt)}
                      </span>
                    )}
                  </div>
                  {project.connected ? (
                    <>
                      <div className="mt-1 truncate text-xs text-base-content/60">
                        {project.siteUrl} ·{" "}
                        {project.connectedAccountEmail ?? "Connected account"}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-md bg-base-200/50 px-3 py-2">
                          <div className="text-xs text-base-content/50">
                            Visibility
                          </div>
                          <div className="mt-1 truncate text-sm">
                            {project.visibilityError ??
                              project.visibilitySummary ??
                              "No data"}
                          </div>
                        </div>
                        <div className="rounded-md bg-base-200/50 px-3 py-2">
                          <div className="text-xs text-base-content/50">
                            Crawl issues
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-sm">
                            {project.crawlIssueCount === null ? (
                              (project.crawlIssuesError ?? "Unavailable")
                            ) : (
                              <>
                                {project.crawlIssueCount > 0 && (
                                  <AlertTriangle className="size-3.5 text-warning" />
                                )}
                                {project.crawlIssueCount}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {project.crawlIssues.length > 0 && (
                        <div className="mt-2 space-y-1 truncate text-xs text-base-content/60">
                          {project.crawlIssues
                            .slice(0, 3)
                            .map((issue, index) => (
                              <div key={`${project.projectId}-issue-${index}`}>
                                {issue}
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-1 text-xs text-base-content/50">
                      Connect a Bing Webmaster property to show visibility and
                      crawl issues.
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-6 text-center text-sm text-base-content/40">
                No active projects found.
              </div>
            )}
          </div>
          <div className="text-right text-xs text-base-content/40">
            Fetched {formatDate(data?.fetchedAt ?? null)}
          </div>
        </div>
      )}
    </section>
  );
}
