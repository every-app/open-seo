import {
  ArrowDown,
  ArrowUp,
  ChartLine,
  CircleCheck,
  CircleX,
  FileText,
  Globe,
  MapPin,
  Search,
  TriangleAlert,
} from "lucide-react";
import { cn } from "cn";

/**
 * Small sketches of what each page shows once it has data. They take the
 * icon's place in an empty state, so a first visit shows the page's result
 * instead of a generic glyph.
 */

const bar = "h-1.5 rounded-full bg-foreground/10";
const tile = "rounded-lg bg-foreground/5";

/** A looked-up domain with its traffic, keywords and pages counts. */
export function DomainProfileIllustration() {
  return (
    <div aria-hidden className="flex w-64 flex-col gap-2 py-2">
      <div className={cn(tile, "flex items-center gap-2 px-3 py-2.5")}>
        <Globe className="size-3.5 text-muted-foreground/50" />
        <div className={cn(bar, "w-24")} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[ChartLine, Search, FileText].map((Icon, index) => (
          <div key={index} className={cn(tile, "space-y-2.5 p-3")}>
            <Icon className="size-3.5 text-muted-foreground/50" />
            <div className="h-2 w-10 rounded-full bg-foreground/20" />
            <div className={cn(bar, "w-7")} />
          </div>
        ))}
      </div>
    </div>
  );
}

const LINK_SOURCES = [16, 48, 80];

/** Three sites linking to one. */
export function BacklinksIllustration() {
  return (
    <svg aria-hidden viewBox="0 0 256 96" className="w-64 py-2" fill="none">
      {LINK_SOURCES.map((y) => (
        <g key={y}>
          <path
            d={`M84 ${y} C 128 ${y}, 124 48, 168 48`}
            className="stroke-foreground/15"
            strokeWidth="1.5"
          />
          <rect
            x="8"
            y={y - 11}
            width="76"
            height="22"
            rx="7"
            className="fill-foreground/5"
          />
          <rect
            x="18"
            y={y - 1.5}
            width={y === 48 ? 44 : 34}
            height="3"
            rx="1.5"
            className="fill-foreground/10"
          />
        </g>
      ))}
      <rect
        x="168"
        y="30"
        width="80"
        height="36"
        rx="9"
        className="fill-primary/10 stroke-primary/30"
      />
      <rect
        x="180"
        y="46.5"
        width="46"
        height="3"
        rx="1.5"
        className="fill-primary/40"
      />
    </svg>
  );
}

const MODEL_DOTS = ["bg-success/60", "bg-warning/70", "bg-info/60"];

/** One prompt, answered by three models side by side. */
export function ModelAnswersIllustration() {
  return (
    <div aria-hidden className="flex w-64 flex-col gap-2 py-2">
      <div className="ml-auto flex w-36 items-center rounded-lg bg-primary/10 px-3 py-2.5">
        <div className="h-1.5 w-24 rounded-full bg-primary/40" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MODEL_DOTS.map((dot, index) => (
          <div key={dot} className={cn(tile, "space-y-2 p-3")}>
            <div className={cn("size-2 rounded-full", dot)} />
            <div className={cn(bar, "w-full")} />
            <div className={cn(bar, index === 1 ? "w-6" : "w-10")} />
            <div className={cn(bar, index === 2 ? "w-5" : "w-8")} />
          </div>
        ))}
      </div>
    </div>
  );
}

const RANK_ROWS = [
  { width: "w-24", position: 2, change: 3 },
  { width: "w-32", position: 5, change: 1 },
  { width: "w-20", position: 11, change: -2 },
];

/** Tracked keywords, each with its position and how far it moved. */
export function RankRowsIllustration() {
  return (
    <div aria-hidden className="flex w-64 flex-col gap-2 py-2">
      {RANK_ROWS.map(({ width, position, change }) => {
        const Arrow = change > 0 ? ArrowUp : ArrowDown;
        return (
          <div
            key={width}
            className={cn(tile, "flex items-center gap-2 px-3 py-2")}
          >
            <div className={cn(bar, width)} />
            <span
              className={cn(
                "ml-auto flex items-center gap-0.5 text-xs font-medium tabular-nums",
                change > 0 ? "text-success" : "text-destructive/80",
              )}
            >
              <Arrow className="size-3" />
              {Math.abs(change)}
            </span>
            <span className="w-7 rounded-md bg-foreground/10 py-0.5 text-center text-xs font-semibold text-foreground/70 tabular-nums">
              {position}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Rank by distance from the business: strong nearby, weaker further out.
const FAR = "bg-destructive/50";
const MID = "bg-warning/70";
const NEAR = "bg-success/70";
const GRID_DOTS = [
  [FAR, MID, MID, MID, FAR],
  [MID, NEAR, NEAR, NEAR, MID],
  [MID, NEAR, null, NEAR, FAR],
  [FAR, MID, NEAR, MID, FAR],
  [FAR, FAR, MID, FAR, FAR],
].flat();

/** A grid of map points around a business, coloured by how well it ranks there. */
export function LocalGridIllustration() {
  return (
    <div
      aria-hidden
      className={cn(tile, "grid grid-cols-5 place-items-center gap-2.5 p-4")}
    >
      {GRID_DOTS.map((dot, index) =>
        dot ? (
          <div key={index} className={cn("size-4 rounded-full", dot)} />
        ) : (
          <MapPin key={index} className="size-5 text-foreground/70" />
        ),
      )}
    </div>
  );
}

const AUDIT_ROWS = [
  { Icon: CircleX, color: "text-destructive/70", width: "w-28" },
  { Icon: TriangleAlert, color: "text-warning", width: "w-20" },
  { Icon: CircleCheck, color: "text-success/80", width: "w-32" },
  { Icon: CircleCheck, color: "text-success/80", width: "w-24" },
];

/** Audit findings: an error, a warning and passed checks. */
export function AuditChecksIllustration() {
  return (
    <div
      aria-hidden
      className="flex w-64 flex-col gap-2 py-2 mask-y-from-70% mask-y-to-100%"
    >
      {AUDIT_ROWS.map(({ Icon, color, width }) => (
        <div
          key={width}
          className={cn(tile, "flex items-center gap-2 px-3 py-2.5")}
        >
          <Icon className={cn("size-3.5", color)} />
          <div className={cn(bar, width)} />
          <div className={cn(bar, "ml-auto w-6")} />
        </div>
      ))}
    </div>
  );
}

const REPORT_BARS = ["h-3", "h-5", "h-4", "h-7", "h-6"];

/** A report page: a heading, a paragraph and a chart. */
export function ReportIllustration() {
  return (
    <div
      aria-hidden
      className="w-40 space-y-2.5 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <div className="h-2 w-20 rounded-full bg-foreground/20" />
      <div className={cn(bar, "w-full")} />
      <div className={cn(bar, "w-24")} />
      <div className="flex h-8 items-end gap-1.5 pt-1">
        {REPORT_BARS.map((height, index) => (
          <div
            key={index}
            className={cn("w-3 rounded-sm bg-primary/30", height)}
          />
        ))}
      </div>
    </div>
  );
}

/** An AI answer that names the business. */
export function AiMentionIllustration() {
  return (
    <div aria-hidden className="flex w-64 flex-col gap-2 py-2">
      <div className="ml-auto flex w-32 items-center rounded-lg bg-foreground/5 px-3 py-2.5">
        <div className={cn(bar, "w-20")} />
      </div>
      <div className={cn(tile, "space-y-2 p-3")}>
        <div className={cn(bar, "w-full")} />
        <div className="flex items-center gap-1.5">
          <div className={cn(bar, "w-12")} />
          <div className="h-3.5 w-16 rounded-full bg-primary/20 ring-1 ring-primary/30" />
          <div className={cn(bar, "w-14")} />
        </div>
        <div className={cn(bar, "w-32")} />
      </div>
    </div>
  );
}
