import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  DeltaTile,
  PanelError,
  PanelLoading,
  StatTile,
} from "@/client/features/revenue/revenueParts";
import {
  deleteRapidapiSnapshot,
  getRapidapiSnapshots,
  logRapidapiSnapshot,
} from "@/serverFunctions/rapidapi";

/**
 * Manually-logged RapidAPI subscriber snapshots. RapidAPI has no platform
 * API for public-marketplace subscriber data (per support, 2026-08-04), so
 * the numbers are copied by hand from Studio → Analytics; the panel shows
 * the latest snapshot with the change since the previous one, a log form,
 * and the history. See specs/0014.
 */
export function RapidapiSnapshotsPanel({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["rapidapiSnapshots", projectId],
    queryFn: () => getRapidapiSnapshots({ data: { projectId } }),
  });
  const data = query.data;
  const latest = data?.report.latest ?? null;
  const previous = data?.report.previous ?? null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">RapidAPI</h2>
      {query.isLoading ? (
        <PanelLoading label="Loading RapidAPI snapshots…" />
      ) : query.isError ? (
        <PanelError onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-base-content/60">
            Logged by hand from RapidAPI Studio → Analytics — RapidAPI has no
            API for marketplace subscriber data.
          </p>
          {latest ? (
            <div className="grid grid-cols-2 gap-3 lg:max-w-xl">
              {previous ? (
                <DeltaTile
                  label={`Active subscribers (${latest.capturedOn})`}
                  value={latest.activeSubscribers}
                  previous={previous.activeSubscribers}
                  previousLabel={previous.capturedOn}
                />
              ) : (
                <StatTile
                  label={`Active subscribers (${latest.capturedOn})`}
                  value={String(latest.activeSubscribers)}
                />
              )}
              {latest.payingSubscribers !== null &&
              previous?.payingSubscribers != null ? (
                <DeltaTile
                  label={`Paying subscribers (${latest.capturedOn})`}
                  value={latest.payingSubscribers}
                  previous={previous.payingSubscribers}
                  previousLabel={previous.capturedOn}
                />
              ) : (
                <StatTile
                  label={`Paying subscribers (${latest.capturedOn})`}
                  value={
                    latest.payingSubscribers === null
                      ? "—"
                      : String(latest.payingSubscribers)
                  }
                />
              )}
            </div>
          ) : null}
          <SnapshotForm projectId={projectId} />
          <SnapshotHistory projectId={projectId} rows={data?.snapshots ?? []} />
        </div>
      )}
    </section>
  );
}

function SnapshotForm({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [capturedOn, setCapturedOn] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [active, setActive] = React.useState("");
  const [paying, setPaying] = React.useState("");

  const logMutation = useMutation({
    mutationFn: () =>
      logRapidapiSnapshot({
        data: {
          projectId,
          capturedOn,
          activeSubscribers: Number(active),
          payingSubscribers: paying === "" ? null : Number(paying),
        },
      }),
    onSuccess: () => {
      toast.success("Snapshot logged");
      setActive("");
      setPaying("");
      void queryClient.invalidateQueries({
        queryKey: ["rapidapiSnapshots", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (active !== "") logMutation.mutate();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Date</span>
        <input
          type="date"
          value={capturedOn}
          onChange={(event) => setCapturedOn(event.target.value)}
          className="input input-bordered input-sm"
          required
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Active subscribers</span>
        <input
          type="number"
          min={0}
          value={active}
          onChange={(event) => setActive(event.target.value)}
          className="input input-bordered input-sm w-36"
          required
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          Paying <span className="text-base-content/50">(optional)</span>
        </span>
        <input
          type="number"
          min={0}
          value={paying}
          onChange={(event) => setPaying(event.target.value)}
          className="input input-bordered input-sm w-36"
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={active === "" || logMutation.isPending}
      >
        {logMutation.isPending ? "Logging…" : "Log snapshot"}
      </button>
    </form>
  );
}

function SnapshotHistory({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Array<{
    id: string;
    capturedOn: string;
    activeSubscribers: number;
    payingSubscribers: number | null;
  }>;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteRapidapiSnapshot({ data: { projectId, id } }),
    onSuccess: () => {
      toast.success("Snapshot deleted");
      void queryClient.invalidateQueries({
        queryKey: ["rapidapiSnapshots", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-base-content/60">
        No snapshots yet — log the current numbers to start the trend.
      </p>
    );
  }
  return (
    <section className="rounded-xl border border-base-300 bg-base-100 shadow-sm lg:max-w-2xl">
      <h3 className="border-b border-base-300 p-4 text-sm font-semibold">
        History
      </h3>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Active</th>
              <th className="text-right">Paying</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="tabular-nums">{row.capturedOn}</td>
                <td className="text-right tabular-nums">
                  {row.activeSubscribers}
                </td>
                <td className="text-right tabular-nums">
                  {row.payingSubscribers ?? "—"}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                    onClick={() => deleteMutation.mutate(row.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
