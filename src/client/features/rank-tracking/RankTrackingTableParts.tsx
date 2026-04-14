import { ArrowUp, ArrowDown, Minus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { captureClientEvent } from "@/client/lib/posthog";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";

export type SortField = "keyword" | "desktopPosition" | "mobilePosition";
export type SortDir = "asc" | "desc";

const HEADER_TOOLTIPS: Record<string, string> = {
  keyword: "The search term being tracked",
  desktopPosition: "Google ranking details on desktop devices",
  mobilePosition: "Google ranking details on mobile devices",
};

export function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onClick,
  className = "",
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onClick: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentField === field;
  return (
    <th
      className={`cursor-pointer select-none text-xs uppercase tracking-wide text-base-content/60 hover:text-base-content ${className}`}
      onClick={() => onClick(field)}
      title={HEADER_TOOLTIPS[field]}
    >
      {label}
      {isActive && (
        <span className="ml-1">{currentDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );
}

function PositionBadge({ position }: { position: number | null }) {
  if (position === null) {
    return <span className="text-base-content/40">-</span>;
  }
  return <span className="font-mono">{position}</span>;
}

function ChangeIndicator({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}) {
  if (previous === null) {
    return null;
  }
  if (current === null) {
    return <span className="badge badge-xs badge-error">lost</span>;
  }

  const change = previous - current; // positive = improved (lower position number is better)
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-success">
        <ArrowUp className="size-3" />+{change}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-error">
        <ArrowDown className="size-3" />
        {change}
      </span>
    );
  }
  return (
    <span className="text-base-content/40">
      <Minus className="size-3 inline" />
    </span>
  );
}

const FEATURE_SHORT_LABELS: Record<string, string> = {
  featured_snippet: "FS",
  people_also_ask: "PAA",
  ai_overview: "AI",
  local_pack: "Local",
  knowledge_panel: "KP",
  video: "Video",
  images: "Img",
  shopping: "Shop",
  top_stories: "News",
};

const FEATURE_TOOLTIPS: Record<string, string> = {
  featured_snippet:
    "Featured Snippet — highlighted answer box at top of results",
  people_also_ask: "People Also Ask — expandable related questions",
  ai_overview: "AI Overview — AI-generated summary at top of search",
  local_pack: "Local Pack — map with local business listings",
  knowledge_panel: "Knowledge Panel — info box about an entity",
  video: "Video — video results shown in the SERP",
  images: "Images — image results shown in the SERP",
  shopping: "Shopping — product listings with prices",
  top_stories: "Top Stories — news articles carousel",
};

function SerpFeatureTags({ features }: { features: string[] }) {
  const notable = features.filter((f) => f in FEATURE_SHORT_LABELS);
  if (notable.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {notable.map((f) => (
        <span
          key={f}
          className="badge badge-outline badge-xs gap-0.5 cursor-help"
          title={FEATURE_TOOLTIPS[f] ?? f}
        >
          {f === "ai_overview" && <Sparkles className="size-2.5" />}
          {FEATURE_SHORT_LABELS[f]}
        </span>
      ))}
    </div>
  );
}

function PositionWithChange({
  position,
  previous,
}: {
  position: number | null;
  previous: number | null;
}) {
  return (
    <span className="inline-flex w-full items-center justify-between px-3">
      <PositionBadge position={position} />
      <ChangeIndicator current={position} previous={previous} />
    </span>
  );
}

export function DeviceRankCell({
  result,
  domain,
}: {
  result: RankTrackingDeviceResult;
  domain: string;
}) {
  return (
    <div className="min-w-44 space-y-1.5">
      <PositionWithChange
        position={result.position}
        previous={result.previousPosition}
      />
      {result.rankingUrl ? (
        <a
          href={toFullUrl(result.rankingUrl, domain)}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-hover block truncate px-3 text-xs"
          title={result.rankingUrl}
        >
          {toPath(result.rankingUrl)}
        </a>
      ) : null}
      {result.serpFeatures.length > 0 ? (
        <div className="px-3">
          <SerpFeatureTags features={result.serpFeatures} />
        </div>
      ) : null}
    </div>
  );
}

export function comparePositions(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls sort last
  if (b === null) return -1;
  return a - b;
}

/** Numeric change for CSV export — numbers bypass the CSV formula-injection sanitizer */
function csvChange(
  current: number | null,
  previous: number | null,
): number | string {
  if (previous === null) return current !== null ? "new" : "";
  if (current === null) return "lost";
  return previous - current;
}

export function exportRankTrackingCsv(
  sorted: RankTrackingRow[],
  showDesktop: boolean,
  showMobile: boolean,
  domain: string,
) {
  if (sorted.length === 0) {
    toast.error("No data to export");
    return;
  }
  const headers = [
    "Keyword",
    ...(showDesktop
      ? [
          "Desktop Position",
          "Desktop Change",
          "Desktop URL",
          "Desktop SERP Features",
        ]
      : []),
    ...(showMobile
      ? [
          "Mobile Position",
          "Mobile Change",
          "Mobile URL",
          "Mobile SERP Features",
        ]
      : []),
  ];
  const csvRows = sorted.map((row) => [
    row.keyword,
    ...(showDesktop
      ? [
          row.desktop.position ?? "Not ranking",
          csvChange(row.desktop.position, row.desktop.previousPosition),
          row.desktop.rankingUrl ?? "",
          row.desktop.serpFeatures.join(", "),
        ]
      : []),
    ...(showMobile
      ? [
          row.mobile.position ?? "Not ranking",
          csvChange(row.mobile.position, row.mobile.previousPosition),
          row.mobile.rankingUrl ?? "",
          row.mobile.serpFeatures.join(", "),
        ]
      : []),
  ]);
  downloadCsv(`rank-tracking-${domain}.csv`, buildCsv(headers, csvRows));
  captureClientEvent("rank_tracking:export_csv");
}

function toPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function toFullUrl(url: string, domain: string): string {
  if (url.startsWith("http")) return url;
  return `https://${domain}${url}`;
}
