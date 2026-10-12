import { groupByProp } from "remeda";
import type {
  AiEngine,
  AiTrend,
  AiTrendComparison,
  AiTrendCoverage,
  AiTrendMetric,
} from "@/shared/ai-visibility";
import {
  aiEngineSchema,
  type AiTrendInput,
} from "@/types/schemas/ai-visibility";
import {
  getTrendObservations,
  listTrendRuns,
} from "../repositories/aiVisibilityTrendRepository";

/** Below this share of planned answers collected in either period, hide the change. */
const MIN_COVERAGE = 0.9;
const DAY_MS = 86_400_000;

type TrendRow = Awaited<ReturnType<typeof getTrendObservations>>[number];
interface Tally {
  answers: number;
  mentions: number;
  citations: number;
}
interface Cell extends Tally {
  engine: AiEngine;
}
type Cells = Map<string, Cell>;
type Rate = (tally: Tally) => number | null;

function answered(row: TrendRow) {
  return row.status === "completed" && row.hasAnswer === 1;
}

function emptyCoverage(): AiTrendCoverage {
  return { runs: 0, expected: 0, answered: 0, noAnswer: 0, failed: 0 };
}

function addCoverage(coverage: AiTrendCoverage, rows: TrendRow[]) {
  coverage.runs++;
  for (const row of rows) {
    coverage.expected++;
    if (answered(row)) coverage.answered++;
    else if (row.status === "completed") coverage.noAnswer++;
    else coverage.failed++;
  }
}

/** Adds answered rows only: failed or empty collections never count as absent. */
function addAnswer(tally: Tally, row: TrendRow) {
  if (!answered(row)) return;
  tally.answers++;
  if (row.mentioned) tally.mentions++;
  if (row.cited) tally.citations++;
}

function emptyTally(): Tally {
  return { answers: 0, mentions: 0, citations: 0 };
}

const mentionRate: Rate = (c) =>
  c.answers ? (c.mentions / c.answers) * 100 : null;
const citationRate: Rate = (c) =>
  c.answers ? (c.citations / c.answers) * 100 : null;

/**
 * A cell is one prompt, engine, collection market and own-brand identity.
 * New prompts, engines, markets or brand edits start new cells.
 */
function cellKey(
  row: TrendRow,
  run: { locationCode: number; languageCode: string },
) {
  return [
    row.promptId,
    row.engine,
    run.locationCode,
    run.languageCode,
    row.brandName,
    row.brandDomain,
  ].join("|");
}

function rates(cells: Cells, rate: Rate) {
  const result = new Map<string, number>();
  for (const [key, cell] of cells) {
    const value = rate(cell);
    if (value !== null) result.set(key, value);
  }
  return result;
}

/** Cells with a rate in both periods. */
function matchedKeys(current: Cells, previous: Cells, rate: Rate) {
  const before = rates(previous, rate);
  return new Set([...rates(current, rate).keys()].filter((k) => before.has(k)));
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

const round = (value: number | null) =>
  value === null ? null : Math.round(value * 10) / 10;

function metric(current: Cells, previous: Cells, rate: Rate): AiTrendMetric {
  const now = rates(current, rate);
  const before = rates(previous, rate);
  const matched = [...now.keys()].filter((key) => before.has(key));
  // Without matched cells there is no comparison, so current covers every cell.
  const currentValue = matched.length
    ? mean(matched.map((key) => now.get(key) ?? 0))
    : mean([...now.values()]);
  const previousValue = mean(matched.map((key) => before.get(key) ?? 0));
  return {
    current: round(currentValue),
    previous: round(previousValue),
    change:
      currentValue !== null && previousValue !== null
        ? round(currentValue - previousValue)
        : null,
    matchedCells: matched.length,
    currentCells: now.size,
    previousCells: before.size,
  };
}

function engineCells(cells: Cells, engine: AiEngine): Cells {
  return new Map([...cells].filter(([, cell]) => cell.engine === engine));
}

const complete = (part: number, total: number) =>
  total > 0 && part / total >= MIN_COVERAGE;

function comparison(
  current: AiTrendCoverage,
  previous: AiTrendCoverage,
  matchedCells: number,
): AiTrendComparison {
  if (!current.runs) return "no_data";
  if (!previous.runs) return "no_previous";
  if (!matchedCells) return "scope_changed";
  return complete(current.answered, current.expected) &&
    complete(previous.answered, previous.expected)
    ? "comparable"
    : "incomplete";
}

/** Run rate over the given cells, or over every cell when none match. */
function runRate(
  rows: { key: string; row: TrendRow }[],
  matched: Set<string>,
  rate: Rate,
) {
  const tally = emptyTally();
  for (const { key, row } of rows)
    if (!matched.size || matched.has(key)) addAnswer(tally, row);
  return round(rate(tally));
}

/**
 * Compares the latest `days` with the `days` before on neutral prompts from
 * finished runs from every trigger. Each period rate is the mean of cell
 * rates over cells collected in both periods.
 */
export async function loadAiTrend(input: AiTrendInput): Promise<AiTrend> {
  const end = Date.now();
  const split = new Date(end - input.days * DAY_MS).toISOString();
  const start = new Date(end - 2 * input.days * DAY_MS).toISOString();
  const runs = await listTrendRuns(input.projectId, start);
  const rowsByRun = groupByProp(
    await getTrendObservations(runs.map((run) => run.id)),
    "runId",
  );
  const periods = {
    current: { cells: new Map() as Cells, coverage: emptyCoverage() },
    previous: { cells: new Map() as Cells, coverage: emptyCoverage() },
  };
  const runRows = runs.map((run) => {
    const period = run.createdAt > split ? periods.current : periods.previous;
    const all = rowsByRun[run.id] ?? [];
    // Prompts that name the brand would always mention it.
    const rows = all.filter((row) => !row.branded);
    const coverage = emptyCoverage();
    addCoverage(coverage, rows);
    addCoverage(period.coverage, rows);
    const keyed = rows.map((row) => ({ key: cellKey(row, run), row }));
    for (const { key, row } of keyed) {
      const cell = period.cells.get(key) ?? {
        engine: row.engine,
        ...emptyTally(),
      };
      addAnswer(cell, row);
      period.cells.set(key, cell);
    }
    return { run, coverage, keyed };
  });
  const { current, previous } = periods;
  const mentions = metric(current.cells, previous.cells, mentionRate);
  const citations = metric(current.cells, previous.cells, citationRate);
  const status = comparison(
    current.coverage,
    previous.coverage,
    Math.max(mentions.matchedCells, citations.matchedCells),
  );
  // Rates stay visible in every state; only a fair comparison shows a change.
  const shown = (value: AiTrendMetric) => ({
    ...value,
    change: status === "comparable" ? value.change : null,
  });
  const engines = new Set(
    [...current.cells.values(), ...previous.cells.values()].map(
      (cell) => cell.engine,
    ),
  );
  // The chart uses the same matched cells as the comparison.
  const matched = {
    mention: matchedKeys(current.cells, previous.cells, mentionRate),
    citation: matchedKeys(current.cells, previous.cells, citationRate),
  };
  return {
    days: input.days,
    comparison: status,
    current: {
      start: split,
      end: new Date(end).toISOString(),
      coverage: current.coverage,
    },
    previous: { start, end: split, coverage: previous.coverage },
    mentions: shown(mentions),
    citations: shown(citations),
    engines: aiEngineSchema.options
      .filter((engine) => engines.has(engine))
      .map((engine) => {
        const now = engineCells(current.cells, engine);
        const before = engineCells(previous.cells, engine);
        return {
          engine,
          mentions: shown(metric(now, before, mentionRate)),
          citations: shown(metric(now, before, citationRate)),
        };
      }),
    runs: runRows.map(({ run, coverage, keyed }) => ({
      runId: run.id,
      createdAt: run.createdAt,
      mentionRate: runRate(keyed, matched.mention, mentionRate),
      citationRate: runRate(keyed, matched.citation, citationRate),
      coverage,
    })),
  };
}
