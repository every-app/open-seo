import { groupByProp, sort } from "remeda";
import {
  aiAnswerCoverage,
  summarizeAiBrands,
} from "@/shared/ai-visibility-results";
import type {
  AiAnswer,
  AiObservationRow,
  AiResults,
  AiRun,
  AiSourceRow,
  AiSources,
} from "@/shared/ai-visibility";
import type {
  AiResultsInput,
  AiSourcesInput,
} from "@/types/schemas/ai-visibility";
import {
  AiVisibilityRepository as repo,
  type ObservationRow,
  type RunRow,
} from "../repositories/AiVisibilityRepository";
import type { ObservationWithPrompt } from "../repositories/AiVisibilityRepository";
import { markdownToText } from "../providers/dataforseoEvidence";
import { AiVisibilityError } from "./aiVisibilityErrors";
import { aiMentionSpans, ownedAiDomain } from "./aiVisibilityMatching";

export function aiRunView(
  run: RunRow,
  observations: Pick<ObservationRow, "status">[],
): AiRun {
  const completed = observations.filter((o) => o.status === "completed").length;
  const failed = observations.filter((o) => o.status === "failed").length;
  return {
    id: run.id,
    status: run.status,
    trigger: run.trigger,
    expected: observations.length,
    completed,
    failed,
    pending: observations.length - completed - failed,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    // Manual and baseline runs collect live answers, which arrive within seconds.
    pollAfterSeconds: run.trigger === "scheduled" ? 20 : 5,
  };
}

type Evidence = Awaited<ReturnType<typeof repo.getEvidence>>;

function rowsFor(
  observations: ObservationWithPrompt[],
  evidence: Evidence,
): AiObservationRow[] {
  const sources = groupByProp(evidence.sources, "observationId");
  const matches = groupByProp(evidence.matches, "observationId");
  return observations.map((o) => ({
    id: o.id,
    runId: o.runId,
    promptId: o.promptId,
    prompt: o.prompt,
    topic: o.topic,
    branded: o.branded,
    engine: o.engine,
    status: o.status,
    answerStatus:
      o.status !== "completed"
        ? null
        : o.answerMarkdown
          ? "answered"
          : "no_answer",
    collectedAt: o.collectedAt,
    error: o.error,
    citationCount: sources[o.id]?.length ?? 0,
    brands: (matches[o.id] ?? []).map((m) => ({
      name: m.name,
      domain: m.domain,
      own: m.own,
      mentioned: m.mentioned,
      cited: m.cited,
      firstMention: m.firstMention,
    })),
  }));
}

async function loadAiResultSet(rawInput: AiResultsInput) {
  const input = {
    ...rawInput,
    runId: rawInput.runId ?? undefined,
    topic: rawInput.topic ?? undefined,
    engines: rawInput.engines ?? undefined,
    promptId: rawInput.promptId ?? undefined,
  };
  if (input.includeHistory && !input.promptId)
    throw new AiVisibilityError(
      "PROMPT_REQUIRED",
      "Provide promptId when requesting answer history.",
    );
  const runs = await repo.listRuns(
    input.projectId,
    input.includeHistory ? 50 : 20,
  );
  let run = input.runId
    ? await repo.getRun(input.projectId, input.runId)
    : await repo.getLatestScheduledRun(input.projectId);
  if (input.runId && !run)
    throw new AiVisibilityError(
      "RUN_NOT_FOUND",
      "This run is not available in the selected project.",
    );
  if (input.includeHistory && !input.runId) run = runs[0] ?? null;
  const runIds =
    input.includeHistory && !input.runId
      ? runs.map((r) => r.id)
      : run
        ? [run.id]
        : [];
  const observations = await repo.getObservations(runIds, input.promptId);
  const scoped = observations.filter(
    (o) =>
      (!input.topic || o.topic === input.topic) &&
      (!input.engines || input.engines.includes(o.engine)) &&
      (input.branded === "all" ||
        (input.branded === "branded" ? o.branded : !o.branded)),
  );
  const evidence = await repo.getEvidence(scoped.map((o) => o.id));
  const rows = rowsFor(scoped, evidence);
  // A gap: a competitor appears where your brand is neither named nor cited.
  const filtered = input.competitorGap
    ? rows.filter((row) => {
        const own = row.brands.find((b) => b.own);
        return (
          !!own &&
          !own.mentioned &&
          !own.cited &&
          row.brands.some((b) => !b.own && (b.mentioned || b.cited))
        );
      })
    : rows;
  const result = {
    runId: run?.id ?? null,
    run: run
      ? aiRunView(
          run,
          observations.filter((o) => o.runId === run.id),
        )
      : null,
    rows: filtered,
    totalCount: filtered.length,
    summaries: summarizeAiBrands(filtered),
    coverage: aiAnswerCoverage(rows),
    appliedFilters: {
      topic: input.topic,
      engines: input.engines,
      competitorGap: input.competitorGap,
      branded: input.branded,
    },
    truncated: input.includeHistory && runs.length === 50,
  };
  return { result, runs, run, observations: scoped, evidence };
}

function resultPage(
  result: Awaited<ReturnType<typeof loadAiResultSet>>["result"],
  input: AiResultsInput,
): AiResults {
  const offset = Number(input.cursor ?? 0);
  return {
    ...result,
    rows: result.rows.slice(offset, offset + input.limit),
    nextCursor:
      offset + input.limit < result.totalCount
        ? String(offset + input.limit)
        : null,
  };
}

export async function loadAiResults(input: AiResultsInput): Promise<AiResults> {
  const { result } = await loadAiResultSet(input);
  return resultPage(result, input);
}

/** App-only history metadata; the MCP results contract remains unchanged. */
export async function loadAiPageResults(input: AiResultsInput) {
  const { result, runs } = await loadAiResultSet(input);
  return {
    ...resultPage(result, input),
    historyRuns:
      input.includeHistory && !input.cursor
        ? runs.map(({ id, createdAt, trigger }) => ({ id, createdAt, trigger }))
        : [],
  };
}

const ANSWER_LIMIT = 24_000;

export async function loadAiAnswer(
  input: { projectId: string; observationId: string },
  { full = false } = {},
): Promise<AiAnswer> {
  const observation = await repo.getObservation(input.observationId);
  const run = observation
    ? await repo.getRun(input.projectId, observation.runId)
    : null;
  if (!observation || !run)
    throw new AiVisibilityError(
      "ANSWER_NOT_FOUND",
      "This answer is not available in the selected project.",
    );
  return answerView(
    observation,
    run,
    await repo.getEvidence([observation.id]),
    full,
  );
}

/** Every answer of one run in full, from a single result-set read. */
export async function loadAiFullAnswers(input: AiResultsInput) {
  const { result, run, observations, evidence } = await loadAiResultSet(input);
  const sources = groupByProp(evidence.sources, "observationId");
  const matches = groupByProp(evidence.matches, "observationId");
  // Rows carry the competitor-gap filter; observations do not.
  const rowIds = new Set(result.rows.map((row) => row.id));
  const answers = run
    ? observations
        .filter((observation) => rowIds.has(observation.id))
        .map((observation) =>
          answerView(
            observation,
            run,
            {
              sources: sources[observation.id] ?? [],
              matches: matches[observation.id] ?? [],
            },
            true,
          ),
        )
    : [];
  return { result, answers };
}

function answerView(
  observation: ObservationWithPrompt,
  run: RunRow,
  evidence: Evidence,
  full: boolean,
): AiAnswer {
  const row = rowsFor([observation], evidence)[0];
  const markdown = observation.answerMarkdown;
  const answerText = markdown ? markdownToText(markdown) : null;
  const limit = full ? Infinity : ANSWER_LIMIT;
  return {
    observation: row,
    answerText: answerText?.slice(0, limit) ?? null,
    answerMarkdown: markdown?.slice(0, limit) ?? null,
    sources: evidence.sources.map(({ url, domain, title, position }) => ({
      url,
      domain,
      title,
      position,
    })),
    // Highlights are worked out for the open answer, not stored.
    mentions: answerText
      ? row.brands
          .filter((b) => b.mentioned)
          .map((b) => ({
            domain: b.domain,
            spans: aiMentionSpans(answerText, [b.name, b.domain]).filter(
              (span) => span.end <= limit,
            ),
          }))
      : [],
    requestedLocationCode: run.locationCode,
    requestedLanguageCode: run.languageCode,
    truncated: (markdown?.length ?? 0) > limit,
  };
}

export async function loadAiSources(input: AiSourcesInput): Promise<AiSources> {
  // Pagination belongs to the source aggregation, never the underlying answers.
  const { result: first, evidence } = await loadAiResultSet(input);
  const groups = new Map<
    string,
    {
      row: AiSourceRow;
      answers: Set<string>;
      prompts: Set<string>;
      engines: Map<AiSourceRow["engines"][number]["engine"], Set<string>>;
    }
  >();
  const observed = new Map(first.rows.map((r) => [r.id, r]));
  for (const source of evidence.sources) {
    const answer = observed.get(source.observationId);
    if (answer?.answerStatus !== "answered") continue;
    const own = answer.brands.find((b) => b.own);
    const ownership =
      own && ownedAiDomain(source.domain, own.domain)
        ? "own"
        : answer.brands.some(
              (b) => !b.own && ownedAiDomain(source.domain, b.domain),
            )
          ? "competitor"
          : "other";
    if (input.ownership !== "all" && input.ownership !== ownership) continue;
    const key = input.groupBy === "domain" ? source.domain : source.url;
    const group = groups.get(key) ?? {
      row: {
        key,
        url: input.groupBy === "url" ? source.url : null,
        domain: source.domain,
        title: input.groupBy === "url" ? source.title : null,
        ownership,
        answerCount: 0,
        promptCount: 0,
        promptIds: [],
        engines: [],
        observationIds: [],
        truncated: false,
      },
      answers: new Set<string>(),
      prompts: new Set<string>(),
      engines: new Map<AiSourceRow["engines"][number]["engine"], Set<string>>(),
    };
    group.answers.add(answer.id);
    group.prompts.add(answer.promptId);
    const engineAnswers = group.engines.get(answer.engine) ?? new Set<string>();
    engineAnswers.add(answer.id);
    group.engines.set(answer.engine, engineAnswers);
    groups.set(key, group);
  }
  const rows = sort(
    [...groups.values()].map((g) => ({
      ...g.row,
      answerCount: g.answers.size,
      promptCount: g.prompts.size,
      promptIds: [...g.prompts],
      engines: [...g.engines].map(([engine, answers]) => ({
        engine,
        answerCount: answers.size,
      })),
      observationIds: [...g.answers].slice(0, 20),
      truncated: g.answers.size > 20,
    })),
    (a, b) => b.answerCount - a.answerCount || a.key.localeCompare(b.key),
  );
  const offset = Number(input.cursor ?? 0);
  return {
    runId: first.runId,
    rows: rows.slice(offset, offset + input.limit),
    totalCount: rows.length,
    nextCursor:
      offset + input.limit < rows.length ? String(offset + input.limit) : null,
    coverage: first.coverage,
    appliedFilters: { ...first.appliedFilters, ownership: input.ownership },
    groupBy: input.groupBy,
    truncated: first.truncated,
  };
}
