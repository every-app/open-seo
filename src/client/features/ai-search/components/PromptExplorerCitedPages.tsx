import { ExternalLink } from "lucide-react";
import {
  formatModelLabel,
  getModelAccent,
} from "@/client/features/ai-search/platformLabels";
import { formatUrlForDisplay } from "@/client/components/table/url";
import type { CitedPage } from "@/client/features/ai-search/promptExplorerCitedPages";

type Props = {
  pages: CitedPage[];
  highlightBrand: string | null;
};

export function PromptExplorerCitedPages({ pages, highlightBrand }: Props) {
  if (pages.length === 0) {
    return (
      <div className="rounded-lg border border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60">
        None of the models cited a source for this prompt.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="text-xs uppercase tracking-wider text-base-content/50">
                Source
              </th>
              <th className="text-xs uppercase tracking-wider text-base-content/50">
                Cited by
              </th>
              <th className="text-right text-xs uppercase tracking-wider text-base-content/50">
                Models
              </th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.url} className="hover:bg-base-200/40">
                <td className="max-w-xl align-top">
                  <SourceCell page={page} highlightBrand={highlightBrand} />
                </td>
                <td className="align-top">
                  <CitedByCell page={page} />
                </td>
                <td className="text-right align-top tabular-nums">
                  {page.citationCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceCell({
  page,
  highlightBrand,
}: {
  page: CitedPage;
  highlightBrand: string | null;
}) {
  return (
    <a href={page.url} target="_blank" rel="noreferrer" className="group block">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`font-medium group-hover:underline ${
            page.matchedBrand ? "text-primary" : "text-base-content"
          }`}
        >
          {page.title || formatUrlForDisplay(page.url)}
        </span>
        {page.matchedBrand ? (
          <span className="badge badge-primary badge-xs border-0">
            {highlightBrand ?? "Brand"}
          </span>
        ) : null}
        <ExternalLink className="size-3 shrink-0 text-base-content/40" />
      </span>
      <span className="block truncate text-xs text-base-content/50">
        {page.domain ?? formatUrlForDisplay(page.url)}
      </span>
    </a>
  );
}

function CitedByCell({ page }: { page: CitedPage }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {page.models.map((model) => (
        <span
          key={model}
          className="inline-flex items-center gap-1.5 text-xs text-base-content/70"
        >
          <span
            className={`size-1.5 rounded-full ${getModelAccent(model).dot}`}
          />
          {formatModelLabel(model)}
        </span>
      ))}
    </div>
  );
}
