import { useState } from "react";
import { DEFAULT_COUNTRY_CODE, countryLabel } from "@/lib/free-tools/countries";
import {
  CountrySelect,
  FIELD_CLASS,
  FieldLabel,
  SubmitButton,
  ToolForm,
} from "@/lib/free-tools/form";
import { KeywordTable } from "@/lib/free-tools/keyword-table";
import type { RankedKeywordRow } from "@/lib/free-tools/labs";
import type { KeywordIdea } from "@/lib/free-tools/labs";
import { formatCount } from "@/lib/free-tools/metric-grid";
import { ToolTable } from "@/lib/free-tools/tool-table";
import { UpsellCard } from "@/lib/free-tools/upsell-card";
import { useToolRun } from "@/lib/free-tools/use-tool-run";
import { brand } from "@/lib/brand";

type Result =
  | { target: string; locationCode: number; keywords: RankedKeywordRow[] }
  | { keyword: string; locationCode: number; keywords: KeywordIdea[] };
export function KeywordDiscoveryTool({
  tool,
}: {
  tool: "competitor-keyword-finder" | "keyword-generator";
}) {
  const competitor = tool === "competitor-keyword-finder";
  const [input, setInput] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_COUNTRY_CODE);
  const { status, errorMessage, result, run } = useToolRun<Result>(
    tool,
    `/api/${tool}`,
  );
  return (
    <div>
      <ToolForm
        onSubmit={run}
        input={{ [competitor ? "target" : "keyword"]: input, locationCode }}
        status={status}
        errorMessage={errorMessage}
      >
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div>
            <FieldLabel htmlFor={`${tool}-input`}>
              {competitor ? "Competitor domain" : "Topic or keyword"}
            </FieldLabel>
            <input
              id={`${tool}-input`}
              name={competitor ? "target" : "keyword"}
              type="text"
              inputMode={competitor ? "url" : "text"}
              autoComplete="off"
              required
              maxLength={competitor ? 300 : 100}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                competitor ? "competitor.com" : "e.g. email marketing"
              }
              disabled={status === "loading"}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${tool}-country`}>Country</FieldLabel>
            <div className="mt-1">
              <CountrySelect
                id={`${tool}-country`}
                value={locationCode}
                onChange={setLocationCode}
                disabled={status === "loading"}
              />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <SubmitButton
            status={status}
            idleLabel={
              competitor ? "Find competitor keywords" : "Generate keyword ideas"
            }
            loadingLabel="Finding keywords…"
          />
        </div>
      </ToolForm>
      {status === "done" && result ? (
        <section className="mt-6 space-y-4" aria-label="Keyword results">
          <h2 className="break-words text-xl font-semibold text-neutral-950">
            {"target" in result
              ? `Top keywords for ${result.target}`
              : `Keyword ideas for “${result.keyword}”`}
          </h2>
          <p className="text-sm leading-6 text-[var(--color-brand-muted)]">
            Showing {result.keywords.length} keywords. Volume is estimated
            monthly searches in {countryLabel(result.locationCode)}. Difficulty
            estimates how hard it may be to rank, from 0 to 100. Lower scores
            suggest easier competition. A dash means data is unavailable.
          </p>
          {"target" in result ? (
            <KeywordTable rows={result.keywords} />
          ) : result.keywords.length ? (
            <ToolTable label="Keyword ideas">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-brand-muted)]">
                    <th className="px-4 py-3 font-medium">Keyword</th>
                    <th className="px-4 py-3 font-medium">Volume</th>
                    <th className="px-4 py-3 font-medium">Difficulty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {result.keywords.map((row) => (
                    <tr key={row.keyword}>
                      <td className="max-w-[320px] break-words px-4 py-3 font-medium">
                        {row.keyword}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatCount(row.searchVolume)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatCount(row.difficulty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ToolTable>
          ) : (
            <p className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 text-sm">
              No keyword ideas found in the available data. Try a broader topic
              or another country.
            </p>
          )}
          <UpsellCard tool={tool} cta="Continue keyword research">
            Explore more keywords and save the ones worth pursuing in {brand.name}.
          </UpsellCard>
        </section>
      ) : null}
    </div>
  );
}
