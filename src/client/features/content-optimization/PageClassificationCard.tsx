import { useMemo } from "react";
import type { OnPageReport } from "@/serverFunctions/contentOptimization";
import { buildClassificationSectionText } from "./agentBrief";
import { SectionCopyButton } from "./SectionCopyButton";
import { STATUS_COLORS } from "./EntityWorklist";

/**
 * Google taxonomy categories: how the ranking pages are classified versus
 * the scanned page's own classification (from the classify job).
 */
export function PageClassificationCard({
  report,
  pageCategory,
}: {
  report: OnPageReport;
  pageCategory: string | null;
}) {
  const rankingPages = report.topic_and_classification.page_classification;

  const dominant = useMemo(() => {
    if (rankingPages.length === 0) return null;
    const tally = new Map<string, number>();
    for (const page of rankingPages) {
      tally.set(page.category, (tally.get(page.category) ?? 0) + 1);
    }
    return [...tally.entries()].toSorted((a, b) => b[1] - a[1])[0];
  }, [rankingPages]);

  if (rankingPages.length === 0 && pageCategory === null) return null;

  const matches =
    pageCategory !== null && dominant !== null && pageCategory === dominant[0];

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Page Google Category</h2>
          <SectionCopyButton
            getText={() => buildClassificationSectionText(report, pageCategory)}
          />
        </div>

        <div className="flex items-center gap-3 rounded-[3px] bg-base-200/60 px-3 py-2.5">
          <span className="w-24 shrink-0 text-[13px] font-semibold">
            Your page
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px]">
            {pageCategory ?? (
              <span className="text-base-content/40">
                Classification pending
              </span>
            )}
          </span>
          {pageCategory !== null && dominant !== null && (
            <span
              className="shrink-0 rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold"
              style={
                matches
                  ? {
                      color: STATUS_COLORS.good,
                      backgroundColor: "rgba(63,185,80,0.12)",
                      borderColor: "rgba(63,185,80,0.28)",
                    }
                  : {
                      color: STATUS_COLORS.present_not_entity,
                      backgroundColor: "rgba(217,169,74,0.12)",
                      borderColor: "rgba(217,169,74,0.28)",
                    }
              }
            >
              {matches ? "Matches ranking pages" : "Differs from ranking pages"}
            </span>
          )}
        </div>

        {rankingPages.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/50">
              Ranking pages
            </p>
            <div className="divide-y divide-base-200">
              {rankingPages.map((page) => (
                <div
                  key={`${page.rank}-${page.url ?? page.category}`}
                  className="flex items-center gap-3 px-1 py-2"
                >
                  <span className="w-6 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-base-content/40">
                    #{page.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">
                    {page.category}
                  </span>
                  {page.url !== null && (
                    <span className="max-w-56 shrink-0 truncate text-[12px] text-base-content/40">
                      {hostname(page.url)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {dominant !== null && dominant[1] > 1 && (
              <p className="pt-1 text-xs text-base-content/50">
                {dominant[1]} of {rankingPages.length} ranking pages share this
                category: {dominant[0]}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
