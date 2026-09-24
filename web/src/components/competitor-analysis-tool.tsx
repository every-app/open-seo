import { KeywordTable } from "@/lib/free-tools/keyword-table";
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

const TOOL = "competitor-analysis";

type KeywordRow = {
  keyword: string | null;
  searchVolume: number | null;
  difficulty: number | null;
  position: number | null;
  url: string | null;
};

type GapRow = KeywordRow & { traffic: number | null };

type PageRow = {
  url: string | null;
  traffic: number | null;
  keywords: number | null;
};

type OrganicMetrics = {
  organicTraffic: number | null;
  organicKeywords: number | null;
  trafficValue: number | null;
};

type AnalysisResult = {
  competitor: string;
  yourDomain: string | null;
  keywords: KeywordRow[];
  totalKeywords: number | null;
  pages: PageRow[];
  totalPages: number | null;
  comparison: { competitor: OrganicMetrics; you: OrganicMetrics } | null;
  gap: GapRow[] | null;
  gapFailed: boolean;
};

export function CompetitorAnalysisTool() {
  const [competitor, setCompetitor] = useState("");
  const [yourDomain, setYourDomain] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_COUNTRY_CODE);
  const { status, errorMessage, result, run } = useToolRun<AnalysisResult>(
    TOOL,
    "/api/competitor-analysis",
  );

  return (
    <div>
      <ToolForm
        onSubmit={run}
        input={{
          competitor,
          yourDomain: yourDomain.trim() || undefined,
          locationCode,
        }}
        status={status}
        errorMessage={errorMessage}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <FieldLabel htmlFor="competitor-domain">
              Competitor domain
            </FieldLabel>
            <input
              id="competitor-domain"
              name="competitor"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              required
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              placeholder="competitor.com"
              disabled={status === "loading"}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="competitor-your-domain">
              Your domain (optional)
            </FieldLabel>
            <input
              id="competitor-your-domain"
              name="yourDomain"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={yourDomain}
              onChange={(e) => setYourDomain(e.target.value)}
              placeholder="example.com"
              disabled={status === "loading"}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="competitor-country">Country</FieldLabel>
            <div className="mt-1">
              <CountrySelect
                id="competitor-country"
                value={locationCode}
                onChange={setLocationCode}
                disabled={status === "loading"}
              />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <SubmitButton status={status} idleLabel="Analyze competitor" />
        </div>
      </ToolForm>

      {status === "done" && result ? <AnalysisReport result={result} /> : null}
    </div>
  );
}

function AnalysisReport({ result }: { result: AnalysisResult }) {
  return (
    <div className="mt-6 space-y-8">
      {result.comparison ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
            {result.competitor} vs {result.yourDomain}
          </h2>
          <div className="mt-3">
            <MetricGrid
              metrics={[
                {
                  label: `${result.competitor} traffic`,
                  value: formatCount(
                    result.comparison.competitor.organicTraffic,
                  ),
                  tip: "Estimated monthly organic visits for the competitor in the selected country.",
                },
                {
                  label: `${result.competitor} keywords`,
                  value: formatCount(
                    result.comparison.competitor.organicKeywords,
                  ),
                },
                {
                  label: `${result.yourDomain} traffic`,
                  value: formatCount(result.comparison.you.organicTraffic),
                  tip: "Estimated monthly organic visits for your domain in the selected country.",
                },
                {
                  label: `${result.yourDomain} keywords`,
                  value: formatCount(result.comparison.you.organicKeywords),
                },
              ]}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
            Traffic value:{" "}
            {formatMoney(result.comparison.competitor.trafficValue)} vs{" "}
            {formatMoney(result.comparison.you.trafficValue)} per month.
          </p>
        </section>
      ) : null}

      {result.gap && result.gap.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
            Keywords they rank for that you don&rsquo;t
          </h2>
          <KeywordTable rows={result.gap} showTraffic />
        </section>
      ) : null}

      {result.gapFailed ? (
        <p className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 text-sm text-neutral-700">
          We couldn't load the keyword comparison. Try again. The competitor's
          keywords and pages below are still available.
        </p>
      ) : null}

      {result.gap && result.gap.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 text-sm text-neutral-700">
          No competitor-only keywords were found in the available data for this
          country.
        </p>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
          Top keywords for{" "}
          <span className="text-[var(--color-brand-accent)]">
            {result.competitor}
          </span>
        </h2>
        <KeywordTable rows={result.keywords} />
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
          Top pages
        </h2>
        {result.pages.length === 0 ? (
          <p className="mt-3 rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 text-sm text-neutral-700">
            No ranking pages found in the available data for this country.
          </p>
        ) : (
          <ToolTable label="Competitor top pages" className="mt-3">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-brand-muted)]">
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">Traffic</th>
                  <th className="px-4 py-3 font-medium">Keywords</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {result.pages.map((row) => (
                  <tr key={row.url ?? ""}>
                    <td className="max-w-[420px] truncate px-4 py-3 align-top text-neutral-950">
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
              </tbody>
            </table>
          </ToolTable>
        )}
      </section>

      <UpsellCard tool={TOOL} cta="Explore more competitor keywords">
        {result.keywords.length > 0 ? (
          <>
            Showing {result.keywords.length}
            {result.totalKeywords !== null
              ? ` of ${formatCount(result.totalKeywords)}`
              : ""}{" "}
            ranking keywords.{" "}
          </>
        ) : (
          <>Try another country or competitor to explore more ranking data. </>
        )}
        Browse more competitor keywords in {brand.name}, filter by search volume,
        difficulty, and ranking position, and save keywords for further
        research.
      </UpsellCard>
    </div>
  );
}
