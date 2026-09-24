import { ToolTable } from "@/lib/free-tools/tool-table";
import { useState } from "react";
import { FIELD_CLASS, SubmitButton, ToolForm } from "@/lib/free-tools/form";
import { formatCount, MetricGrid } from "@/lib/free-tools/metric-grid";
import { UpsellCard } from "@/lib/free-tools/upsell-card";
import { useToolRun } from "@/lib/free-tools/use-tool-run";
import { brand } from "@/lib/brand";

const TOOL = "spam-score-checker";

type SpamResult = {
  target: string;
  spamScore: number | null;
  targetSpamScore: number | null;
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  worstBacklinks: Array<{
    domainFrom: string | null;
    urlFrom: string | null;
    anchor: string | null;
    dofollow: boolean | null;
    domainRank: number | null;
    spamScore: number | null;
  }>;
};

export function SpamScoreCheckerTool() {
  const [target, setTarget] = useState("");
  const { status, errorMessage, result, run } = useToolRun<SpamResult>(
    TOOL,
    "/api/spam-score-checker",
  );

  return (
    <div>
      <ToolForm
        onSubmit={run}
        input={{ target }}
        status={status}
        errorMessage={errorMessage}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="spam-target" className="sr-only">
            Domain to check
          </label>
          <input
            id="spam-target"
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
            className={FIELD_CLASS}
          />
          <SubmitButton status={status} idleLabel="Check spam score" />
        </div>
      </ToolForm>

      {status === "done" && result ? (
        <div className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
            Spam signals for{" "}
            <span className="text-[var(--color-brand-accent)]">
              {result.target}
            </span>
          </h2>

          <div className="mt-3">
            <MetricGrid
              metrics={[
                {
                  label: "Backlink spam score",
                  value: formatCount(result.spamScore),
                  tip: "DataForSEO's 0-100 estimate of how spammy the links pointing at this domain look, based on signals like the linking sites' own profiles. Higher is worse.",
                },
                {
                  label: "Domain spam score",
                  value: formatCount(result.targetSpamScore),
                  tip: "The same 0-100 scale applied to this domain itself rather than to the links pointing at it.",
                },
                {
                  label: "Referring domains",
                  value: formatCount(result.referringDomains),
                  tip: "Unique websites linking to this domain at least once.",
                },
                {
                  label: "Domain rank",
                  value: formatCount(result.rank),
                  tip: "DataForSEO's 0-100 link-profile strength score for this domain.",
                },
              ]}
            />
          </div>

          <h3 className="mt-6 text-base font-semibold text-neutral-950">
            The spammiest links pointing here
          </h3>
          {result.worstBacklinks.length > 0 ? (
            <ToolTable label="Spam Score Checker results" className="mt-3">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-brand-muted)]">
                    <th className="px-4 py-3 font-medium">Spam score</th>
                    <th className="px-4 py-3 font-medium">Linking page</th>
                    <th className="px-4 py-3 font-medium">Anchor</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {result.worstBacklinks.map((row) => (
                    <tr key={row.urlFrom ?? row.domainFrom ?? ""}>
                      <td className="px-4 py-3 align-top tabular-nums text-neutral-950">
                        {formatCount(row.spamScore)}
                      </td>
                      <td className="max-w-[320px] px-4 py-3 align-top">
                        <p className="truncate font-medium text-neutral-950">
                          {row.domainFrom ?? "—"}
                        </p>
                        {row.urlFrom ? (
                          <span className="block truncate text-xs text-[var(--color-brand-muted)]">
                            {row.urlFrom}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 align-top text-neutral-700">
                        {row.anchor ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-neutral-700">
                        {row.dofollow ? "Follow" : "Nofollow"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ToolTable>
          ) : (
            <p className="mt-3 rounded-lg border border-[var(--color-border-subtle)] bg-white p-5 text-sm text-neutral-700">
              No live backlinks found for this domain in the index yet.
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
            Spammy links are normal. A handful of scraper sites is not a
            problem; a profile where most referring domains score high is worth
            a closer look.
          </p>

          <UpsellCard tool={TOOL} cta="Audit the whole profile">
            The free check lists the 10 spammiest referring domains. {brand.name}
            filters the full backlink profile by spam score so you can see how
            much of it is junk.
          </UpsellCard>
        </div>
      ) : null}
    </div>
  );
}
