import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sortBy } from "remeda";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDomainHistory } from "@/serverFunctions/domain";
import { normalizeDomainHistoryTarget } from "@/types/schemas/domain";
import {
  DOMAIN_HISTORY_MAX_DOMAINS,
  type DomainHistoryResult,
  type DomainHistorySeries,
  currentIsoDate,
  dateMonthsAgo,
  estimateDomainHistoryCostUsd,
} from "@/shared/domain-history";
import { applyBillingMarkupUsd } from "@/shared/billing";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const PERIOD_OPTIONS = [6, 12, 24, 60] as const;
const COLORS = ["#2563eb", "#f97316", "#16a34a", "#a855f7", "#e11d48"];

type Metric = "organicTraffic" | "organicKeywords";

export function DomainTrafficHistory({
  projectId,
  domain,
  locationCode,
}: {
  projectId: string;
  domain: string;
  locationCode: number | undefined;
}) {
  const [competitors, setCompetitors] = useState("");
  const [periodMonths, setPeriodMonths] = useState<number>(24);
  const [metric, setMetric] = useState<Metric>("organicTraffic");
  const [validationError, setValidationError] = useState<string | null>(null);
  const dateFrom = dateMonthsAgo(periodMonths);
  const dateTo = currentIsoDate();
  const parsedDomains = useMemo(
    () => parseDomains(domain, competitors),
    [competitors, domain],
  );
  const rawCost = estimateDomainHistoryCostUsd(
    parsedDomains.ok ? parsedDomains.domains.length : 1,
    dateFrom,
    dateTo,
  );
  const displayedCost = isHostedClientAuthMode()
    ? applyBillingMarkupUsd(rawCost)
    : rawCost;

  const historyMutation = useMutation<DomainHistoryResult, Error, string[]>({
    mutationFn: (domains: string[]) =>
      getDomainHistory({
        data: {
          projectId,
          domains,
          dateFrom,
          dateTo,
          locationCode,
        },
      }),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!parsedDomains.ok) {
      setValidationError(parsedDomains.message);
      return;
    }
    setValidationError(null);
    historyMutation.mutate(parsedDomains.domains);
  };

  const chart = useMemo(
    () => buildChartData(historyMutation.data?.series ?? [], metric),
    [historyMutation.data, metric],
  );

  return (
    <section className="rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Historical search visibility</h2>
          <p className="text-sm text-base-content/65">
            Compare monthly DataForSEO estimates. Data is available from October
            2020 and refreshed weekly.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end"
        >
          <label className="form-control min-w-0">
            <span className="label-text mb-1 text-xs font-medium">
              Competitors
            </span>
            <input
              type="text"
              className={`input input-bordered w-full ${validationError ? "input-error" : ""}`}
              placeholder="competitor.com, another.com"
              value={competitors}
              onChange={(event) => setCompetitors(event.target.value)}
              aria-invalid={validationError ? true : undefined}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 text-xs font-medium">Period</span>
            <select
              className="select select-bordered"
              value={periodMonths}
              onChange={(event) => setPeriodMonths(Number(event.target.value))}
            >
              {PERIOD_OPTIONS.map((months) => (
                <option key={months} value={months}>
                  {months < 12 ? `${months} months` : `${months / 12} years`}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control">
            <span className="label-text mb-1 text-xs font-medium">Metric</span>
            <select
              className="select select-bordered"
              value={metric}
              onChange={(event) => {
                if (isMetric(event.target.value)) {
                  setMetric(event.target.value);
                }
              }}
            >
              <option value="organicTraffic">Estimated traffic</option>
              <option value="organicKeywords">Ranking keywords</option>
            </select>
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={historyMutation.isPending}
          >
            {historyMutation.isPending
              ? "Loading..."
              : `Compare · up to $${displayedCost.toFixed(2)}`}
          </button>
        </form>

        <p className="mt-2 text-xs text-base-content/55">
          The current domain is included automatically. Add up to four more.
          Cached repeats do not make another provider request.
        </p>
        {validationError ? (
          <p className="mt-2 text-sm text-error">{validationError}</p>
        ) : null}
        {historyMutation.isError ? (
          <p className="mt-2 text-sm text-error">
            {getStandardErrorMessage(
              historyMutation.error,
              "Historical comparison failed.",
            )}
          </p>
        ) : null}
      </div>

      {historyMutation.data ? (
        chart.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-base-content/60">
            No historical estimates were returned for these domains.
          </div>
        ) : (
          <div className="h-80 min-w-0 p-4" aria-label="Domain history chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.rows} margin={{ left: 8, right: 16 }}>
                <CartesianGrid
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  opacity={0.12}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatMonth}
                  minTickGap={28}
                />
                <YAxis tickFormatter={formatAxisValue} width={58} />
                <Tooltip
                  formatter={(value) =>
                    typeof value === "number"
                      ? value.toLocaleString()
                      : String(value ?? "")
                  }
                  labelFormatter={(value) => formatMonth(String(value))}
                />
                <Legend />
                {chart.series.map((item, index) => (
                  <Line
                    key={item.domain}
                    type="monotone"
                    dataKey={item.key}
                    name={item.domain}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        <div className="p-6 text-sm text-base-content/60">
          Run the comparison to load the selected historical period. These are
          modeled estimates, not Google Search Console measurements.
        </div>
      )}
    </section>
  );
}

function parseDomains(primaryDomain: string, rawCompetitors: string) {
  try {
    const domains = [
      normalizeDomainHistoryTarget(primaryDomain),
      ...rawCompetitors
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(normalizeDomainHistoryTarget),
    ];
    const unique = [...new Set(domains)];
    if (unique.length > DOMAIN_HISTORY_MAX_DOMAINS) {
      return {
        ok: false as const,
        message: `Compare up to ${DOMAIN_HISTORY_MAX_DOMAINS} domains at once.`,
      };
    }
    return { ok: true as const, domains: unique };
  } catch {
    return {
      ok: false as const,
      message:
        "Historical traffic supports domains and subdomains only. DataForSEO cannot return folder history such as example.com/jp.",
    };
  }
}

function buildChartData(series: DomainHistorySeries[], metric: Metric) {
  const dates = sortBy(
    [
      ...new Set(
        series.flatMap((item) => item.points.map((point) => point.date)),
      ),
    ],
    (date) => date,
  );
  const keyedSeries = series.map((item, index) => ({
    domain: item.domain,
    key: `domain${index}`,
    values: new Map(item.points.map((point) => [point.date, point[metric]])),
  }));
  const rows = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const item of keyedSeries) {
      row[item.key] = item.values.get(date) ?? null;
    }
    return row;
  });
  return { rows, series: keyedSeries };
}

function isMetric(value: string): value is Metric {
  return value === "organicTraffic" || value === "organicKeywords";
}

function formatAxisValue(value: unknown) {
  if (typeof value !== "number") return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function formatMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
