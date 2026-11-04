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

const MAX_COMPETITOR_FAVICONS = 4;

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
}: {
  items: {
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
    strong?: boolean;
  }[];
}) {
  return (
    <div className="flex min-w-48 flex-col gap-1.5 py-0.5">
      {items.map(({ key, icon, label, value, strong }) => (
        <div key={key} className="flex items-center gap-2">
          {icon}
          <span className={cn("flex-1 pr-2", strong && "font-semibold")}>
            {label}
          </span>
          <span className="tabular-nums opacity-80">{value}</span>
        </div>
      ))}
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

/** Favicons of the competitors these answers name, with each named brand's count on hover. */
export function CompetitorStack({
  rows,
  loading,
}: {
  rows: AiObservationRow[] | undefined;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-7 w-20 rounded-full" />;
  // Most named first. The sort is stable, so your brand leads a tie.
  const brands = sort(
    summarizeAiBrands(rows ?? []).filter((brand) => brand.mentions > 0),
    (a, b) => b.mentions - a.mentions,
  );
  const named = brands.filter((brand) => !brand.own);
  if (!named.length)
    return <span className="text-sm text-muted-foreground">—</span>;
  const shown = named.slice(0, MAX_COMPETITOR_FAVICONS);
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
        {named.length > shown.length && (
          <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
            +{named.length - shown.length}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-none">
        <ResultList
          items={brands.map((brand) => ({
            key: brand.domain,
            icon: <DomainFavicon domain={brand.domain} />,
            label: brand.name,
            value: `${brand.mentions} of ${brand.answers}`,
            strong: brand.own,
          }))}
        />
      </TooltipContent>
    </Tooltip>
  );
}
