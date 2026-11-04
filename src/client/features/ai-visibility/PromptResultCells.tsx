import type { ReactNode } from "react";
import { cn } from "cn";
import { sort } from "remeda";
import {
  AI_ENGINE_LABELS,
  aiNoAnswerLabel,
  type AiEngine,
  type AiObservationRow,
} from "@/shared/ai-visibility";
import { summarizeAiBrands } from "@/shared/ai-visibility-results";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { DomainFavicon } from "./DomainFavicon";
import { EngineIcon } from "./EngineIcon";
import { aiRate } from "./shared";

const MAX_SHOWN_COMPETITORS = 4;

export function PromptRate({
  rows,
  kind,
  loading,
}: {
  rows: AiObservationRow[] | undefined;
  kind: "mentioned" | "cited";
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-4 w-10" />;
  const eligible =
    rows?.filter(
      (row) =>
        row.answerStatus === "answered" &&
        row.brands.some((brand) => brand.own),
    ) ?? [];
  const count = eligible.filter((row) =>
    row.brands.some((brand) => brand.own && brand[kind]),
  ).length;
  return (
    <span
      className="flex flex-col text-sm tabular-nums"
      title={
        rows
          ? `${count} of ${eligible.length} eligible answers`
          : "No results available"
      }
    >
      {aiRate(count, eligible.length)}
      {eligible.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {count} of {eligible.length}
        </span>
      )}
    </span>
  );
}

/** The hover list behind the engine and competitor cells. */
function ResultList({
  items,
  more = 0,
}: {
  items: {
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
  }[];
  /** How many items were left out of the list. */
  more?: number;
}) {
  return (
    <div className="flex min-w-48 flex-col gap-1.5 py-0.5">
      {items.map(({ key, icon, label, value }) => (
        <div key={key} className="flex items-center gap-2">
          {icon}
          <span className="flex-1 pr-2">{label}</span>
          <span className="tabular-nums opacity-80">{value}</span>
        </div>
      ))}
      {more > 0 && <span className="pl-6 opacity-80">+{more} more</span>}
    </div>
  );
}

function engineResult(engine: AiEngine, row: AiObservationRow | undefined) {
  if (!row) return "No result available";
  if (row.status === "failed") return "Failed";
  if (row.status === "pending") return "Running";
  if (row.answerStatus === "no_answer") return aiNoAnswerLabel(engine);
  if (row.answerStatus !== "answered") return "Answer unavailable";
  return row.brands.find((brand) => brand.own)?.mentioned
    ? "Mentioned"
    : "Not mentioned";
}

/** Each engine's logo, colored by its result, with one hover list for them all. */
export function EngineResults({
  engines,
  rows,
}: {
  engines: AiEngine[];
  rows: AiObservationRow[] | undefined;
}) {
  const results = engines.map((engine) => ({
    engine,
    label: AI_ENGINE_LABELS[engine],
    result: engineResult(
      engine,
      rows?.find((row) => row.engine === engine),
    ),
  }));
  return (
    <Tooltip>
      <TooltipTrigger
        delay={100}
        aria-label={results
          .map(({ label, result }) => `${label}: ${result}`)
          .join(", ")}
        className="flex items-center gap-2.5"
      >
        {results.map(({ engine, result }) => (
          <EngineIcon
            key={engine}
            engine={engine}
            aria-hidden="true"
            className={cn(
              "size-4",
              result === "Mentioned"
                ? "text-success"
                : result === "Failed"
                  ? "text-destructive"
                  : "text-muted-foreground/60",
            )}
          />
        ))}
      </TooltipTrigger>
      <TooltipContent className="max-w-none">
        <ResultList
          items={results.map(({ engine, label, result }) => ({
            key: engine,
            icon: (
              <EngineIcon
                engine={engine}
                aria-hidden="true"
                className="size-4 shrink-0"
              />
            ),
            label,
            value: result,
          }))}
        />
      </TooltipContent>
    </Tooltip>
  );
}

/** Favicons of the competitors these answers name, with the same competitors' counts on hover. */
export function CompetitorStack({
  rows,
  loading,
}: {
  rows: AiObservationRow[] | undefined;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-7 w-20 rounded-full" />;
  // Most named first.
  const named = sort(
    summarizeAiBrands(rows ?? []).filter(
      (brand) => !brand.own && brand.mentions > 0,
    ),
    (a, b) => b.mentions - a.mentions,
  );
  if (!named.length)
    return <span className="text-sm text-muted-foreground">—</span>;
  const shown = named.slice(0, MAX_SHOWN_COMPETITORS);
  const more = named.length - shown.length;
  return (
    <Tooltip>
      <TooltipTrigger
        delay={100}
        aria-label={`Competitors named: ${named
          .map((brand) => brand.name)
          .join(", ")}`}
        className="flex items-center"
      >
        {shown.map((brand) => (
          <span
            key={brand.domain}
            className="-ml-1.5 flex size-7 items-center justify-center rounded-full border border-border bg-card first:ml-0"
          >
            <DomainFavicon domain={brand.domain} />
          </span>
        ))}
        {more > 0 && (
          <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
            +{more}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-none">
        <ResultList
          items={shown.map((brand) => ({
            key: brand.domain,
            icon: <DomainFavicon domain={brand.domain} />,
            label: brand.name,
            value: `${brand.mentions} of ${brand.answers}`,
          }))}
          more={more}
        />
      </TooltipContent>
    </Tooltip>
  );
}
