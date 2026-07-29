import { Trash2 } from "lucide-react";
import { ScoreBadge } from "@/client/features/pagespeed/PagespeedScoreBadge";
import type {
  PagespeedSnapshotLike,
  SnapshotWithPrevious,
} from "@/shared/pagespeed";

export type PsiUrlRow = { id: string; url: string; isHomepage: boolean };

/** Monitored URLs with their latest scores, each row runnable on its own. */
export function PagespeedUrlTable({
  urls,
  latest,
  runningIds,
  selectedUrlId,
  onSelect,
  onRun,
  onRemove,
}: {
  urls: PsiUrlRow[];
  latest: Map<string, SnapshotWithPrevious>;
  runningIds: ReadonlySet<string>;
  selectedUrlId: string | null;
  onSelect: (urlId: string) => void;
  onRun: (urlId: string) => void;
  onRemove: (urlId: string) => void;
}) {
  if (urls.length === 0) {
    return (
      <p className="p-4 text-sm text-base-content/60">
        No URLs yet. Add one above to start measuring.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>URL</th>
            <th>Perf</th>
            <th>A11y</th>
            <th>Best pr.</th>
            <th>SEO</th>
            <th>Field CWV</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {urls.map((url) => {
            const entry = latest.get(url.id);
            const snapshot = entry?.snapshot;
            const running = runningIds.has(url.id);
            return (
              <tr
                key={url.id}
                className={`cursor-pointer hover:bg-base-200/50 ${
                  selectedUrlId === url.id ? "bg-base-200/60" : ""
                }`}
                onClick={() => onSelect(url.id)}
              >
                <td className="max-w-md">
                  <span className="block truncate font-mono text-xs">
                    {url.url}
                  </span>
                  {url.isHomepage ? (
                    <span className="text-[11px] text-base-content/55">
                      Homepage
                    </span>
                  ) : null}
                </td>
                <td>
                  <ScoreBadge
                    score={snapshot?.performanceScore}
                    previous={entry?.previous?.performanceScore}
                  />
                </td>
                <td>
                  <ScoreBadge
                    score={snapshot?.accessibilityScore}
                    previous={entry?.previous?.accessibilityScore}
                  />
                </td>
                <td>
                  <ScoreBadge
                    score={snapshot?.bestPracticesScore}
                    previous={entry?.previous?.bestPracticesScore}
                  />
                </td>
                <td>
                  <ScoreBadge
                    score={snapshot?.seoScore}
                    previous={entry?.previous?.seoScore}
                  />
                </td>
                <td>
                  <FieldVerdict snapshot={snapshot} />
                </td>
                <td className="whitespace-nowrap text-right">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={running}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRun(url.id);
                    }}
                  >
                    {running ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      "Run"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    aria-label={`Remove ${url.url}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(url.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FieldVerdict({
  snapshot,
}: {
  snapshot: PagespeedSnapshotLike | undefined;
}) {
  if (!snapshot) {
    return <span className="text-xs text-base-content/50">Not run</span>;
  }
  if (snapshot.errorMessage) {
    return (
      <span className="text-xs text-error" title={snapshot.errorMessage}>
        Run failed
      </span>
    );
  }
  if (!snapshot.fieldOverallCategory) {
    return <span className="text-xs text-base-content/50">No field data</span>;
  }
  const tone =
    snapshot.fieldOverallCategory === "FAST"
      ? "badge-success"
      : snapshot.fieldOverallCategory === "AVERAGE"
        ? "badge-warning"
        : "badge-error";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`badge badge-sm ${tone}`}>
        {snapshot.fieldOverallCategory}
      </span>
      {snapshot.fieldSource === "origin" ? (
        <span
          className="text-[11px] text-base-content/55"
          title="Google had no field data for this URL, so these are origin-wide numbers"
        >
          origin
        </span>
      ) : null}
    </span>
  );
}
