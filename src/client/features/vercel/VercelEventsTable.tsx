import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";

type VercelEventRow = { key: string; visitors: number; count: number };

/** Custom events sent with track(), with an exact vs-prior-30-days delta on
 *  the event count. Synthetic rows ("Others") carry no delta. */
export function VercelEventsTable({
  rows,
  prevRows,
}: {
  rows: VercelEventRow[];
  prevRows: VercelEventRow[];
}) {
  const previous = new Map(prevRows.map((row) => [row.key, row.count]));
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Event</th>
            <th className="text-right">Visitors</th>
            <th className="text-right">Events</th>
            <th className="text-right">vs prior 30d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const prev =
              row.key === "Others" ? undefined : previous.get(row.key);
            return (
              <tr key={row.key}>
                <td className="max-w-xs">
                  <span
                    className="block truncate font-mono text-xs"
                    title={row.key}
                  >
                    {row.key}
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  {formatCount(row.visitors)}
                </td>
                <td className="text-right tabular-nums">
                  {formatCount(row.count)}
                </td>
                <td className="text-right tabular-nums text-xs">
                  {prev === undefined ? (
                    <span className="text-base-content/40">–</span>
                  ) : prev === 0 ? (
                    row.count > 0 ? (
                      <span className="text-success">new</span>
                    ) : (
                      <span className="text-base-content/40">–</span>
                    )
                  ) : (
                    <span
                      className={
                        row.count >= prev ? "text-success" : "text-error"
                      }
                    >
                      {row.count >= prev ? "+" : ""}
                      {(((row.count - prev) / prev) * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
