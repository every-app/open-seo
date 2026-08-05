import * as React from "react";
import { useState } from "react";
import { TabButton } from "@/client/features/search-performance/SearchPerformanceParts";
import { BingAiOverviewPanel } from "@/client/features/bing/BingAiOverviewPanel";
import { BingAiPagesPanel } from "@/client/features/bing/BingAiPagesPanel";
import { BingAiQueriesPanel } from "@/client/features/bing/BingAiQueriesPanel";

type AiTab = "overview" | "pages" | "queries";

/**
 * Bing Webmaster Tools' "AI performance" report (citations in Copilot/AI
 * answers) has no API, only CSV exports — Overview, Pages, and Queries.
 * Each sub-tab uploads its own CSV; there is nothing to fetch live. See
 * specs/0015.
 */
export function BingAiCitationsPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<AiTab>("overview");

  return (
    <div className="p-4">
      <p className="mb-4 text-sm text-base-content/60">
        Bing has no API for AI citations — export the CSV from Webmaster
        Tools → Reports → AI performance and upload it here.
      </p>
      <div role="tablist" className="tabs tabs-boxed mb-4 w-fit">
        <TabButton
          active={tab === "overview"}
          onClick={() => setTab("overview")}
          label="Overview"
        />
        <TabButton
          active={tab === "pages"}
          onClick={() => setTab("pages")}
          label="Pages"
        />
        <TabButton
          active={tab === "queries"}
          onClick={() => setTab("queries")}
          label="Queries"
        />
      </div>
      {tab === "overview" ? (
        <BingAiOverviewPanel projectId={projectId} />
      ) : tab === "pages" ? (
        <BingAiPagesPanel projectId={projectId} />
      ) : (
        <BingAiQueriesPanel projectId={projectId} />
      )}
    </div>
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function AiStatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <span className="mt-1 block text-2xl font-semibold tabular-nums">
        {value}
      </span>
      {hint ? (
        <p className="mt-1 text-xs text-base-content/50">{hint}</p>
      ) : null}
    </div>
  );
}

export function AiPanelLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-base-content/50">
      <span className="loading loading-spinner loading-sm" />
      {label}
    </div>
  );
}

export function AiPanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-error">Couldn't load AI performance data.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** Upload form shared by the Pages and Queries tabs — unlike the daily
 *  Overview CSV, neither carries a per-row date, so the window has to be
 *  entered by hand at upload time (see specs/0015). */
export function BingAiSnapshotUploadForm({
  onUpload,
  isPending,
}: {
  onUpload: (input: {
    csvText: string;
    periodStart: string;
    periodEnd: string;
  }) => void;
  isPending: boolean;
}) {
  const [periodStart, setPeriodStart] = React.useState(() => daysAgoIso(30));
  const [periodEnd, setPeriodEnd] = React.useState(() => todayIso());
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    onUpload({ csvText: await file.text(), periodStart, periodEnd });
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
      onSubmit={(event) => void submit(event)}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Window start</span>
        <input
          type="date"
          value={periodStart}
          onChange={(event) => setPeriodStart(event.target.value)}
          className="input input-bordered input-sm"
          required
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Window end</span>
        <input
          type="date"
          value={periodEnd}
          onChange={(event) => setPeriodEnd(event.target.value)}
          className="input input-bordered input-sm"
          required
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">CSV file</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="file-input file-input-bordered file-input-sm"
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={!file || isPending}
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

/** Picks which upload to view — newest first, `null` value means latest. */
export function BingAiSnapshotPicker({
  snapshots,
  selectedId,
  onChange,
}: {
  snapshots: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    rowCount: number;
  }>;
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  if (snapshots.length === 0) return null;
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">Snapshot</span>
      <select
        className="select select-bordered select-sm"
        value={selectedId ?? snapshots[0]?.id}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === snapshots[0]?.id ? null : value);
        }}
      >
        {snapshots.map((snapshot, index) => (
          <option key={snapshot.id} value={snapshot.id}>
            {snapshot.periodStart} to {snapshot.periodEnd} ({snapshot.rowCount}{" "}
            rows){index === 0 ? " — latest" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
