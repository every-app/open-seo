import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import { formatLocationLabel } from "@/shared/keyword-locations";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";

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

export function SerpFeatureTags({ features }: { features: string[] }) {
  const notable = features.filter((f) => f in FEATURE_SHORT_LABELS);
  if (notable.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {notable.map((f) => (
        <span
          key={f}
          className="badge badge-xs gap-0.5 cursor-help bg-base-300 border-0 text-base-content/70"
          title={FEATURE_TOOLTIPS[f] ?? f}
        >
          {f === "ai_overview" && <Sparkles className="size-2.5" />}
          {FEATURE_SHORT_LABELS[f]}
        </span>
      ))}
    </div>
  );
}

export function DeviceRankCell({
  result,
}: {
  result: RankTrackingDeviceResult;
}) {
  const { position, previousPosition } = result;

  // Nothing at all
  if (position === null && previousPosition === null) {
    return <span className="text-base-content/40">-</span>;
  }

  // Was ranking, now lost
  if (position === null && previousPosition !== null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-xs text-base-content/40 w-6 text-right">
          {previousPosition}
        </span>
        <span className="text-base-content/30">→</span>
        <span className="font-mono rounded px-1.5 py-0.5 text-xs font-semibold bg-error/20 text-error">
          lost
        </span>
      </span>
    );
  }

  // First check — no previous data
  if (previousPosition === null) {
    return <span className="font-mono">{position}</span>;
  }

  // Both exist — show old → new with colored badge
  const change = previousPosition - position!;
  let badgeClass = "bg-base-200 text-base-content";
  if (change > 0) badgeClass = "bg-success/20 text-success";
  if (change < 0) badgeClass = "bg-warning/20 text-warning";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs text-base-content/40 w-6 text-right">
        {previousPosition}
      </span>
      <span className="text-base-content/30">→</span>
      <span
        className={`font-mono rounded px-1.5 py-0.5 text-xs font-semibold ${badgeClass}`}
      >
        {position}
      </span>
    </span>
  );
}

export function DeviceUrlCell({
  result,
  domain,
}: {
  result: RankTrackingDeviceResult;
  domain: string;
}) {
  if (!result.rankingUrl) {
    return <span className="text-base-content/40 text-xs">-</span>;
  }
  return (
    <a
      href={toFullUrl(result.rankingUrl, domain)}
      target="_blank"
      rel="noopener noreferrer"
      className="link link-hover block truncate text-xs"
      title={result.rankingUrl}
    >
      {toPath(result.rankingUrl)}
    </a>
  );
}

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function VolumeCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-base-content/40">-</span>;
  return (
    <span className="font-mono text-sm">{compactFormatter.format(value)}</span>
  );
}

export function DifficultyCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-base-content/40">-</span>;
  let badgeClass = "bg-success/20 text-success";
  if (value > 60) badgeClass = "bg-error/20 text-error";
  else if (value > 30) badgeClass = "bg-warning/20 text-warning";
  return (
    <span
      className={`font-mono rounded px-1.5 py-0.5 text-xs font-semibold ${badgeClass}`}
    >
      {value}
    </span>
  );
}

export function CpcCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-base-content/40">-</span>;
  return <span className="font-mono text-sm">${value.toFixed(2)}</span>;
}

/** Numeric change for CSV export — numbers bypass the CSV formula-injection sanitizer */
export function csvChange(
  current: number | null,
  previous: number | null,
): number | string {
  if (previous === null) return current !== null ? "new" : "";
  if (current === null) return "lost";
  return previous - current;
}

type RankTrackingExportMeta = {
  locationName?: string | null;
  lastCheckedAt?: string | null;
};

/**
 * Formats a run timestamp as a machine-sortable `YYYY-MM-DD` date for exports.
 *
 * Timestamps arrive as UTC in two shapes depending on the DB backend: SQLite/D1
 * `"YYYY-MM-DD HH:MM:SS"` (no zone) and Postgres ISO `"YYYY-MM-DDTHH:MM:SS.sssZ"`.
 * Both start with the UTC calendar date, so we slice it straight from the string
 * and report the stored date as-is. Parsing the zone-less D1 string through
 * `new Date()` would treat it as LOCAL time, and `toISOString()` could then shift
 * it a day off (e.g. an early-morning-UTC check exporting as the previous day).
 *
 * Returns "" for missing or unparseable values so the column stays present but
 * empty rather than emitting "Invalid Date".
 */
export function formatCheckedAtDate(value: string | null | undefined): string {
  if (!value) return "";
  const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (isoDate) return isoDate[1];
  // Fallback for any other parseable shape; guard against "Invalid Date".
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function buildRankTrackingExport(
  sorted: RankTrackingRow[],
  showDesktop: boolean,
  showMobile: boolean,
  options: RankTrackingExportMeta = {},
): { headers: string[]; rows: (string | number)[][] } {
  const { locationName, lastCheckedAt } = options;
  const checkedAt = formatCheckedAtDate(lastCheckedAt);
  const headers = [
    "Keyword",
    // Exports lack the table's tooltip, so name the city inline.
    locationName
      ? `Local volume (${formatLocationLabel(locationName, 2)})`
      : "Volume",
    "KD",
    "CPC",
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
    // Appended last so existing column indices (e.g. the CPC formatting in
    // exportRankTrackingCsv keyed on index 3) stay stable.
    "Last checked at",
  ];
  // Emit empty cells (not "Not ranking" strings) so Sheets infers a numeric
  // column type and the user can sort by position.
  const rows = sorted.map((row) => [
    row.keyword,
    row.searchVolume ?? "",
    row.keywordDifficulty ?? "",
    row.cpc ?? "",
    ...(showDesktop
      ? [
          row.desktop.position ?? "",
          csvChange(row.desktop.position, row.desktop.previousPosition),
          row.desktop.rankingUrl ?? "",
          row.desktop.serpFeatures.join(", "),
        ]
      : []),
    ...(showMobile
      ? [
          row.mobile.position ?? "",
          csvChange(row.mobile.position, row.mobile.previousPosition),
          row.mobile.rankingUrl ?? "",
          row.mobile.serpFeatures.join(", "),
        ]
      : []),
    checkedAt,
  ]);
  return { headers, rows };
}

export function exportRankTrackingToSheets(
  sorted: RankTrackingRow[],
  showDesktop: boolean,
  showMobile: boolean,
  meta: RankTrackingExportMeta = {},
) {
  const { headers, rows } = buildRankTrackingExport(
    sorted,
    showDesktop,
    showMobile,
    meta,
  );
  void exportTableToSheets({ headers, rows, feature: "rank_tracking" });
}

export function exportRankTrackingCsv(
  sorted: RankTrackingRow[],
  showDesktop: boolean,
  showMobile: boolean,
  domain: string,
  meta: RankTrackingExportMeta = {},
) {
  if (sorted.length === 0) {
    toast.error("No data to export");
    return;
  }
  const { headers, rows } = buildRankTrackingExport(
    sorted,
    showDesktop,
    showMobile,
    meta,
  );
  // CSV file download keeps cents-formatted CPC for human readability;
  // clipboard/Sheets export uses raw numbers (see buildRankTrackingExport).
  const csvRows = rows.map((row) =>
    row.map((cell, idx) =>
      idx === 3 && typeof cell === "number" ? cell.toFixed(2) : cell,
    ),
  );
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
