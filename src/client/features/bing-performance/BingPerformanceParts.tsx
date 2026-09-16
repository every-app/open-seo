import type { BingPerformanceTableDimension } from "@/types/schemas/bing-performance";

export type Tab = "striking" | "queries" | "pages";

type BingTotals = { clicks: number; impressions: number; ctr: number };

type BingQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  avgClickPosition: number;
  avgImpressionPosition: number;
};

type BingPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  avgClickPosition: number;
  avgImpressionPosition: number;
};

type BingStrikingRow = {
  query: string;
  clicks: number;
  impressions: number;
  avgImpressionPosition: number;
};

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatCtr(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPosition(value: number): string {
  return value.toFixed(1);
}

function deltaLabel(current: number, previous: number | null): string | null {
  if (previous === null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function TotalsCards({
  totals,
  prevTotals,
}: {
  totals: BingTotals;
  prevTotals: BingTotals | null;
}) {
  const cards: Array<{ label: string; value: string; delta: string | null }> = [
    {
      label: "Clicks",
      value: formatCount(totals.clicks),
      delta: prevTotals ? deltaLabel(totals.clicks, prevTotals.clicks) : null,
    },
    {
      label: "Impressions",
      value: formatCount(totals.impressions),
      delta: prevTotals
        ? deltaLabel(totals.impressions, prevTotals.impressions)
        : null,
    },
    {
      label: "CTR",
      value: formatCtr(totals.ctr),
      delta: prevTotals ? deltaLabel(totals.ctr, prevTotals.ctr) : null,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-base-300 bg-base-100 p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            {card.label}
          </p>
          <p className="mt-1 text-2xl font-semibold">{card.value}</p>
          {card.delta ? (
            <p className="mt-1 text-xs text-base-content/60">
              {card.delta} vs. prior half of Bing's window
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <a
      role="tab"
      className={`tab ${active ? "tab-active" : ""}`}
      onClick={onClick}
    >
      {label}
    </a>
  );
}

export function StrikingDistanceTable({ rows }: { rows: BingStrikingRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-base-content/60">
        No queries in the striking-distance band (position 5–20) right now.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto p-4">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Query</th>
            <th className="text-right">Impressions</th>
            <th className="text-right">Clicks</th>
            <th className="text-right">Avg. impression position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.query}>
              <td className="max-w-md truncate">{row.query}</td>
              <td className="text-right">{formatCount(row.impressions)}</td>
              <td className="text-right">{formatCount(row.clicks)}</td>
              <td className="text-right">
                {formatPosition(row.avgImpressionPosition)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueryTable({ rows }: { rows: BingQueryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-base-content/60">
        No query data yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto p-4">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Query</th>
            <th className="text-right">Impressions</th>
            <th className="text-right">Clicks</th>
            <th className="text-right">Avg. click position</th>
            <th className="text-right">Avg. impression position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.query}>
              <td className="max-w-md truncate">{row.query}</td>
              <td className="text-right">{formatCount(row.impressions)}</td>
              <td className="text-right">{formatCount(row.clicks)}</td>
              <td className="text-right">
                {formatPosition(row.avgClickPosition)}
              </td>
              <td className="text-right">
                {formatPosition(row.avgImpressionPosition)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageTable({ rows }: { rows: BingPageRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-base-content/60">
        No page data yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto p-4">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Page</th>
            <th className="text-right">Impressions</th>
            <th className="text-right">Clicks</th>
            <th className="text-right">Avg. click position</th>
            <th className="text-right">Avg. impression position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.page}>
              <td className="max-w-md truncate">{row.page}</td>
              <td className="text-right">{formatCount(row.impressions)}</td>
              <td className="text-right">{formatCount(row.clicks)}</td>
              <td className="text-right">
                {formatPosition(row.avgClickPosition)}
              </td>
              <td className="text-right">
                {formatPosition(row.avgImpressionPosition)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function tabDimension(tab: Tab): BingPerformanceTableDimension {
  return tab === "pages" ? "page" : "query";
}
