import {
  AI_ENGINE_LABELS,
  aiNoAnswerLabel,
  type AiEngine,
  type AiObservationRow,
} from "@/shared/ai-visibility";
import { Skeleton } from "@/client/components/ui/skeleton";
import { EngineLabel } from "./EngineLabel";
import { aiRate } from "./shared";

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

export function EngineResult({
  engine,
  row,
}: {
  engine: AiEngine;
  row: AiObservationRow | undefined;
}) {
  const own = row?.brands.find((brand) => brand.own);
  const result = !row
    ? "No result available"
    : row.status === "failed"
      ? "Failed"
      : row.status === "pending"
        ? "Running"
        : row.answerStatus === "no_answer"
          ? aiNoAnswerLabel(engine)
          : row.answerStatus !== "answered"
            ? "Answer unavailable"
            : own?.mentioned
              ? "Mentioned"
              : "Not mentioned";
  return (
    <span
      title={`${AI_ENGINE_LABELS[engine]}: ${result}`}
      className={`inline-flex h-6 items-center text-xs ${result === "Mentioned" ? "text-success" : result === "Failed" ? "text-destructive" : "text-muted-foreground"}`}
    >
      <EngineLabel engine={engine} />
    </span>
  );
}
