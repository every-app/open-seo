import { ToolTable } from "@/lib/free-tools/tool-table";
import { useState } from "react";
import { DEFAULT_COUNTRY_CODE } from "@/lib/free-tools/countries";
import {
  CountrySelect,
  FIELD_CLASS,
  FieldLabel,
  SubmitButton,
  ToolForm,
} from "@/lib/free-tools/form";
import {
  formatCount,
  formatMoney,
  MetricGrid,
} from "@/lib/free-tools/metric-grid";
import { UpsellCard } from "@/lib/free-tools/upsell-card";
import { useToolRun } from "@/lib/free-tools/use-tool-run";
import { brand } from "@/lib/brand";

const TOOL = "website-traffic-checker";

type KeywordRow = {
  keyword: string | null;
  searchVolume: number | null;
  position: number | null;
  url: string | null;
};

type PageRow = {
  url: string | null;
  traffic: number | null;
  keywords: number | null;
};

type DomainTraffic = {
  domain: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
  trafficValue: number | null;
  topKeywords: KeywordRow[];
  topPages: PageRow[];
  totalPages: number | null;
};

type TrafficResult = {
  locationCode: number;
  primary: DomainTraffic;
  comparison: DomainTraffic | null;
};

export function WebsiteTrafficCheckerTool() {
  const [target, setTarget] = useState("");
  const [compare, setCompare] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_COUNTRY_CODE);
  const { status, errorMessage, result, run } = useToolRun<TrafficResult>(
    TOOL,
    "/api/website-traffic-checker",
  );

  return (
    <div>
      <ToolForm
        onSubmit={run}
        input={{ target, compare: compare.trim() || undefined, locationCode }}
        status={status}
        errorMessage={errorMessage}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <FieldLabel htmlFor="traffic-target">Domain</FieldLabel>
            <input
              id="traffic-target"
              name="target"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="example.com"
              disabled={status === "loading"}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="traffic-compare">
              Compare with (optional)
            </FieldLabel>
            <input
              id="traffic-compare"
              name="compare"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={compare}
              onChange={(e) => setCompare(e.target.value)}
              placeholder="competitor.com"
              disabled={status === "loading"}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="traffic-country">Country</FieldLabel>
            <div className="mt-1">
              <CountrySelect
                id="traffic-country"
                value={locationCode}
                onChange={setLocationCode}
                disabled={status === "loading"}
              />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <SubmitButton status={status} idleLabel="Check traffic" />
        </div>
      </ToolForm>

      {status === "done" && result ? (
        <div className="mt-6 space-y-8">
          {result.comparison ? (
            <section>
              <h2 className="text-lg font-semibold text-neutral-950">
                Compare domains
              </h2>
              <ToolTable label="Domain traffic comparison" className="mt-3">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-subtle)]">
                      <th scope="col" className="px-4 py-3 font-medium">
                        Metric
                      </th>
                      <th
                        scope="col"
                        className="max-w-[240px] break-words px-4 py-3 font-medium"
                      >
                        {result.primary.domain}
                      </th>
                      <th
                        scope="col"
                        className="max-w-[240px] break-words px-4 py-3 font-medium"
                      >
                        {result.comparison.domain}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {[
                      {
                        label: "Estimated visits / month",
                        key: "organicTraffic" as const,
                        format: formatCount,
                      },
                      {
                        label: "Organic keywords",
                        key: "organicKeywords" as const,
                        format: formatCount,
                      },
                      {
                        label: "Traffic value / month",
                        key: "trafficValue" as const,
                        format: formatMoney,
                      },
                      {
                        label: "Ranking pages",
                        key: "totalPages" as const,
                        format: formatCount,
                      },
                    ].map(({ label, key, format }) => (
                      <tr key={key}>
                        <th
                          scope="row"
                          className="px-4 py-3 font-normal text-neutral-700"
                        >
                          {label}
                        </th>
                        <td className="px-4 py-3 font-semibold tabular-nums">
                          {format(result.primary[key])}
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums">
                          {format(result.comparison?.[key])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ToolTable>
              <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
                Traffic is estimated from rankings. Traffic value estimates the
                monthly cost of equivalent Google Ads clicks.
              </p>
            </section>
          ) : null}
          <DomainReport
            data={result.primary}
            showMetrics={!result.comparison}
          />
          {result.comparison ? (
            <DomainReport data={result.comparison} showMetrics={false} />
          ) : null}
          <UpsellCard tool={TOOL} cta="Explore more keywords and pages">
            The free checker shows the top 5 keywords and pages per domain.
            {brand.name} lets you browse more keywords and pages, filter the results,
            and save keywords for rank tracking.
          </UpsellCard>
        </div>
      ) : null}
    </div>
  );
}

function DomainReport({
  data,
  showMetrics = true,
}: {
  data: DomainTraffic;
  showMetrics?: boolean;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
        <span className="text-[var(--color-brand-accent)]">{data.domain}</span>
      </h2>

      {showMetrics ? (
        <div className="mt-3">
          <MetricGrid
            metrics={[
              {
                label: "Organic traffic / month",
                value: formatCount(data.organicTraffic),
                tip: "DataForSEO's estimated monthly organic visits, derived from the keywords this domain ranks for and their search volume. An estimate, not analytics data.",
              },
              {
                label: "Organic keywords",
                value: formatCount(data.organicKeywords),
                tip: "How many keywords this domain ranks for in the selected country's top 100 organic results.",
              },
              {
                label: "Traffic value",
                value: formatMoney(data.trafficValue),
                tip: "What this organic traffic would cost per month to buy through Google Ads at current CPCs.",
              },
              {
                label: "Ranking pages",
                value: formatCount(data.totalPages),
                tip: "How many pages on this domain rank for at least one keyword in the selected country.",
              },
            ]}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ToolTable label={`Top keywords for ${data.domain}`}>
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-brand-muted)]">
                <th className="px-4 py-3 font-medium">Top keyword</th>
                <th className="px-4 py-3 font-medium">Volume</th>
                <th className="px-4 py-3 font-medium">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {data.topKeywords.map((row) => (
                <tr key={row.keyword ?? row.url ?? ""}>
                  <td className="max-w-[240px] px-4 py-3 align-top">
                    <p className="truncate font-medium text-neutral-950">
                      {row.keyword ?? "—"}
                    </p>
                    {row.url ? (
                      <p className="truncate text-xs text-[var(--color-brand-muted)]">
                        {row.url}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums text-neutral-700">
                    {formatCount(row.searchVolume)}
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums text-neutral-700">
                    {formatCount(row.position)}
                  </td>
                </tr>
              ))}
              {data.topKeywords.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-4 text-sm text-neutral-700"
                  >
                    No ranking keywords found for this country.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ToolTable>

        <ToolTable label={`Top pages for ${data.domain}`}>
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-brand-muted)]">
                <th className="px-4 py-3 font-medium">Top page</th>
                <th className="px-4 py-3 font-medium">Traffic</th>
                <th className="px-4 py-3 font-medium">Keywords</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {data.topPages.map((row) => (
                <tr key={row.url ?? ""}>
                  <td className="max-w-[240px] truncate px-4 py-3 align-top text-neutral-950">
                    {row.url ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums text-neutral-700">
                    {formatCount(row.traffic)}
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums text-neutral-700">
                    {formatCount(row.keywords)}
                  </td>
                </tr>
              ))}
              {data.topPages.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-4 text-sm text-neutral-700"
                  >
                    No ranking pages found for this country.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ToolTable>
      </div>
    </section>
  );
}
