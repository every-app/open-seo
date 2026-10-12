import { useState } from "react";
import { sort } from "remeda";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  aiObservationStatusLabel,
  type AiPrompt,
} from "@/shared/ai-visibility";
import { summarizeAiBrands } from "@/shared/ai-visibility-results";
import type { getAiVisibilityResults } from "@/serverFunctions/ai-visibility";
import { aiEngineSchema } from "@/types/schemas/ai-visibility";
import { EngineLabel } from "./EngineLabel";
import { PromptAnswers } from "./PromptAnswers";
import {
  PromptDateRange,
  PromptRange,
  inPromptPeriod,
  promptPeriod,
} from "./PromptDateRange";
import { PromptExecutions, type PromptExecution } from "./PromptExecutions";
import { PromptSummary } from "./PromptSummary";
import { aiDate } from "./shared";

const answered = ({ observation }: PromptExecution) =>
  observation.status === "completed" && observation.answerStatus === "answered";

export function PromptAnalysis({
  projectId,
  prompt,
  history,
}: {
  projectId: string;
  prompt: AiPrompt | undefined;
  history: Awaited<ReturnType<typeof getAiVisibilityResults>>;
}) {
  const [period, setPeriod] = useState(() => promptPeriod());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const executions = sort(
    history.historyRuns.flatMap((run) =>
      history.rows
        .filter(
          (row) =>
            row.runId === run.id &&
            inPromptPeriod(row.collectedAt ?? run.createdAt, period),
        )
        .map((observation) => ({ observation, run })),
    ),
    (a, b) =>
      b.run.createdAt.localeCompare(a.run.createdAt) ||
      (b.observation.collectedAt ?? b.run.createdAt).localeCompare(
        a.observation.collectedAt ?? a.run.createdAt,
      ),
  );
  const selected =
    executions.find(({ observation }) => observation.id === selectedId) ??
    executions.find(answered) ??
    executions[0];
  const summaries = summarizeAiBrands(
    executions.map(({ observation }) => observation),
  );
  return (
    <div className="space-y-4">
      <PromptDateRange value={period} onChange={setPeriod} />
      <PromptSummary summaries={summaries} />
      {selected ? (
        <>
          <PromptAnswers
            projectId={projectId}
            prompt={prompt}
            observation={selected.observation}
            controls={
              <ExecutionSelects
                executions={executions}
                selected={selected}
                onSelect={setSelectedId}
              />
            }
          />
          <PromptExecutions
            executions={executions}
            selectedId={selected.observation.id}
            onSelect={setSelectedId}
          />
        </>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-card p-8 text-center">
          <h2 className="text-sm font-medium">
            {history.rows.length
              ? "No executions in this period"
              : "No answers yet"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {history.rows.length
              ? "Choose another date range to see this prompt’s answers."
              : "Choose Run now to collect answers, brand mentions, and citations."}
          </p>
          {history.rows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPeriod(promptPeriod(PromptRange.All))}
            >
              Show all available history
            </Button>
          )}
        </div>
      )}
      {history.truncated && (
        <p className="text-xs text-muted-foreground">
          History covers the latest 50 project runs. Older executions are not
          included in this period’s metrics.
        </p>
      )}
    </div>
  );
}

/** Pick an answer by AI provider, then by when it was collected. */
function ExecutionSelects({
  executions,
  selected,
  onSelect,
}: {
  executions: PromptExecution[];
  selected: PromptExecution;
  onSelect: (id: string) => void;
}) {
  const engine = selected.observation.engine;
  const engineItems = aiEngineSchema.options
    .filter((value) =>
      executions.some(({ observation }) => observation.engine === value),
    )
    .map((value) => ({ value, label: <EngineLabel engine={value} /> }));
  const dateItems = executions
    .filter(({ observation }) => observation.engine === engine)
    .map(({ observation, run }) => ({
      value: observation.id,
      label: `${aiDate(observation.collectedAt ?? run.createdAt)}${
        observation.status === "completed"
          ? ""
          : ` · ${aiObservationStatusLabel(observation.status)}`
      }`,
    }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={engineItems}
        value={engine}
        onValueChange={(next) => {
          // Keep the same run when that provider answered it.
          const forEngine = executions.filter(
            ({ observation }) => observation.engine === next,
          );
          const match =
            forEngine.find(({ run }) => run.id === selected.run.id) ??
            forEngine.find(answered) ??
            forEngine[0];
          if (match) onSelect(match.observation.id);
        }}
      >
        <SelectTrigger size="sm" aria-label="AI provider">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {engineItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={dateItems}
        value={selected.observation.id}
        onValueChange={(id) => {
          if (id) onSelect(id);
        }}
      >
        <SelectTrigger size="sm" aria-label="Answer date">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dateItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
