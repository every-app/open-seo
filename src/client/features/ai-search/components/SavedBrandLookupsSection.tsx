import { useQuery } from "@tanstack/react-query";
import { Database, Trash2 } from "lucide-react";
import {
  listSavedBrandLookups,
  removeSavedBrandLookup,
} from "@/serverFunctions/ai-search";
import {
  RESEARCH_SCOPE_LABELS,
  researchScopeSchema,
} from "@/shared/researchScope";

// Server-persisted Brand Lookup runs, as opposed to the localStorage "recent
// searches" list above it. These follow the project rather than the browser and
// keep the numbers each run returned, which is what makes a month-over-month
// comparison possible at all.

type Props = {
  projectId: string;
  onOpenRun: (runId: string) => void;
};

const numberFormat = new Intl.NumberFormat("en-US");

/**
 * The stored scope is a plain column, so it is narrowed at runtime rather than
 * asserted — a row written by an older build could hold anything.
 */
function scopeLabel(scope: string): string {
  const parsed = researchScopeSchema.safeParse(scope);
  return parsed.success ? RESEARCH_SCOPE_LABELS[parsed.data] : scope;
}

function formatWhen(iso: string): string {
  // Stored values are either ISO or SQLite's "YYYY-MM-DD HH:MM:SS" (UTC).
  const normalized = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SavedBrandLookupsSection({ projectId, onOpenRun }: Props) {
  const runsQuery = useQuery({
    queryKey: ["brand-lookup-saved-runs", projectId],
    queryFn: () => listSavedBrandLookups({ data: { projectId } }),
    staleTime: 30 * 1000,
  });

  const runs = runsQuery.data ?? [];
  if (runsQuery.isLoading || runs.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <Database className="size-4 text-base-content/60" />
        <h2 className="font-medium text-base-content text-sm">Saved lookups</h2>
        <span className="text-base-content/50 text-xs">
          kept on the server, opening one costs nothing
        </span>
      </div>

      <div className="overflow-x-auto rounded-box border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Target</th>
              <th className="text-right">Mentions</th>
              <th className="text-right">Share of voice</th>
              <th>Run</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="hover">
                <td>
                  <button
                    type="button"
                    onClick={() => onOpenRun(run.id)}
                    className="text-left font-medium text-base-content hover:underline"
                  >
                    {run.query}
                  </button>
                  {run.scope ? (
                    <span className="badge badge-ghost badge-sm ml-2 align-middle">
                      {scopeLabel(run.scope)}
                    </span>
                  ) : null}
                  {run.competitors.length > 0 ? (
                    <p className="truncate text-base-content/50 text-xs">
                      vs {run.competitors.join(", ")}
                    </p>
                  ) : null}
                </td>
                <td className="text-right tabular-nums">
                  {run.totalMentions === null
                    ? "—"
                    : numberFormat.format(run.totalMentions)}
                </td>
                <td className="text-right tabular-nums">
                  {run.shareOfVoicePercent === null
                    ? "—"
                    : `${run.shareOfVoicePercent}%`}
                </td>
                <td className="whitespace-nowrap text-base-content/70">
                  {formatWhen(run.createdAt)}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    aria-label={`Delete saved lookup for ${run.query}`}
                    className="btn btn-ghost btn-xs"
                    onClick={async () => {
                      await removeSavedBrandLookup({
                        data: { projectId, runId: run.id },
                      });
                      await runsQuery.refetch();
                    }}
                  >
                    <Trash2 className="size-3.5" />
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
