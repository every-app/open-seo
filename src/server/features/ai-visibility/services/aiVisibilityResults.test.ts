import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import type { RunRow } from "../repositories/AiVisibilityRepository";
import {
  loadAiAnswer,
  loadAiResults,
  loadAiSources,
} from "./aiVisibilityResults";
import { configuration } from "./aiVisibilityTestFixtures";
import { exportAiData } from "./aiVisibilityExport";
import { getTrendObservations } from "../repositories/aiVisibilityTrendRepository";

const { testDb } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } = await import("../aiVisibilityTestDb");
  return { testDb: await createAiVisibilityTestDb() };
});
const r2Put = vi.hoisted(() => vi.fn<(key: string, body: string) => void>());
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1", R2: { put: r2Put } },
}));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));

const projectId = "project";
const own = { name: "OpenSEO", domain: "openseo.so", own: true };
const rival = { name: "Ahrefs", domain: "ahrefs.com", own: false };
type Answer = {
  markdown?: string | null;
  failed?: boolean;
  mentioned?: string[];
  cited?: string[];
  sources?: string[];
};

/** One run of the given answers, each on its own prompt. */
async function seedRun(
  trigger: RunRow["trigger"],
  answers: Answer[],
  createdAt = "2026-09-05T12:00:00.000Z",
) {
  const config =
    (await repo.getConfiguration(projectId)) ??
    configuration({ engines: ["chatgpt"], prompts: [] });
  const prompts = answers.map((_, index) => ({
    id: `prompt-${index}`,
    trackerId: config.tracker.id,
    topic: "General",
    text: `Question ${index}?`,
    paused: false,
    archived: false,
    createdAt,
  }));
  await repo.saveConfiguration({ ...config, prompts });
  const runId = `${trigger}-${createdAt}`;
  await repo.createRun(
    {
      id: runId,
      trackerId: config.tracker.id,
      projectId,
      trigger,
      status: "completed",
      locationCode: 2840,
      languageCode: "en",
      createdAt,
    },
    prompts.map((prompt) => ({
      id: `${runId}:${prompt.id}`,
      runId,
      promptId: prompt.id,
      engine: "chatgpt",
      branded: false,
    })),
  );
  for (const [index, answer] of answers.entries()) {
    const id = `${runId}:prompt-${index}`;
    await repo.persistAnswer({
      observationId: id,
      values: answer.failed
        ? { status: "failed", error: "Provider failed" }
        : { status: "completed", answerMarkdown: answer.markdown ?? null },
      sources: (answer.sources ?? []).map((url, position) => ({
        id: crypto.randomUUID(),
        observationId: id,
        url,
        domain: new URL(url).hostname,
        title: null,
        position: position + 1,
      })),
      matches: answer.failed
        ? []
        : [own, rival].map((brand) => {
            const mentioned = !!answer.mentioned?.includes(brand.name);
            return {
              id: crypto.randomUUID(),
              observationId: id,
              ...brand,
              mentioned,
              cited: !!answer.cited?.includes(brand.name),
              firstMention: mentioned
                ? (answer.markdown?.indexOf(brand.name) ?? null)
                : null,
            };
          }),
    });
  }
  return runId;
}

const query = { projectId, branded: "all" as const, limit: 25 };

beforeEach(() => testDb.seedProject());

describe("AI visibility results", () => {
  it("rates brands over answered collections only; empty and failed ones are coverage", async () => {
    await seedRun("baseline", [
      { markdown: "OpenSEO and Ahrefs", mentioned: ["OpenSEO", "Ahrefs"] },
      { markdown: "Ahrefs", mentioned: ["Ahrefs"], cited: ["OpenSEO"] },
      { markdown: null },
      { failed: true },
    ]);

    const results = await loadAiResults({
      ...query,
      includeHistory: false,
      competitorGap: false,
    });

    expect(results.coverage).toEqual({
      expected: 4,
      completed: 2,
      noAnswer: 1,
      failed: 1,
      pending: 0,
    });
    expect(results.summaries).toMatchObject([
      {
        domain: "openseo.so",
        answers: 2,
        mentions: 1,
        citations: 1,
        positionTotal: 1,
        positionCount: 1,
      },
      // Second in the first answer, first in the second: average 1.5.
      { domain: "ahrefs.com", answers: 2, mentions: 2, positionTotal: 3 },
    ]);
  });

  it("reads the latest scheduled run by default, not a newer manual check", async () => {
    const baseline = await seedRun("baseline", [{ markdown: "x" }]);
    await seedRun("manual", [{ markdown: "y" }], "2026-09-06T12:00:00.000Z");
    const results = await loadAiResults({
      ...query,
      includeHistory: false,
      competitorGap: false,
    });
    expect(results.runId).toBe(baseline);
  });

  it("finds competitor gaps: a competitor appears where the brand is neither named nor cited", async () => {
    await seedRun("baseline", [
      { markdown: "Ahrefs", mentioned: ["Ahrefs"] },
      { markdown: "Ahrefs, OpenSEO", mentioned: ["Ahrefs", "OpenSEO"] },
      { markdown: "Something else" },
    ]);
    const results = await loadAiResults({
      ...query,
      includeHistory: false,
      competitorGap: true,
    });
    expect(results.rows.map((row) => row.prompt)).toEqual(["Question 0?"]);
  });

  it("groups cited pages by owner across answers", async () => {
    await seedRun("baseline", [
      {
        markdown: "a",
        sources: ["https://openseo.so/pricing", "https://ahrefs.com/blog"],
      },
      { markdown: "b", sources: ["https://openseo.so/pricing"] },
      { markdown: null, sources: ["https://example.com/ignored"] },
    ]);
    const sources = await loadAiSources({
      ...query,
      includeHistory: false,
      competitorGap: false,
      groupBy: "url",
      ownership: "all",
    });
    expect(sources.rows).toMatchObject([
      {
        url: "https://openseo.so/pricing",
        ownership: "own",
        answerCount: 2,
        promptIds: ["prompt-0", "prompt-1"],
      },
      { url: "https://ahrefs.com/blog", ownership: "competitor" },
    ]);
  });

  it("works out where each mentioned brand appears in the open answer", async () => {
    const runId = await seedRun("baseline", [
      { markdown: "Use **OpenSEO**.", mentioned: ["OpenSEO"] },
    ]);
    const answer = await loadAiAnswer({
      projectId,
      observationId: `${runId}:prompt-0`,
    });
    expect(answer.answerText).toBe("Use OpenSEO.");
    expect(answer.mentions).toEqual([
      { domain: "openseo.so", spans: [{ start: 4, end: 11 }] },
    ]);
  });
});

describe("AI visibility trend reads", () => {
  it("reads each answer's own-brand result and whether it was answered", async () => {
    const runId = await seedRun("baseline", [
      { markdown: "OpenSEO", mentioned: ["OpenSEO"], cited: ["Ahrefs"] },
      { markdown: null },
    ]);
    expect(await getTrendObservations([runId])).toMatchObject([
      { promptId: "prompt-0", hasAnswer: 1, mentioned: true, cited: false },
      { promptId: "prompt-1", hasAnswer: 0, mentioned: false, cited: false },
    ]);
  });
});

describe("AI visibility export", () => {
  it("returns an absolute download link, so it opens outside the app", async () => {
    await seedRun("baseline", [
      { markdown: "OpenSEO", mentioned: ["OpenSEO"] },
    ]);
    const { url } = await exportAiData(
      {
        ...query,
        includeHistory: false,
        competitorGap: false,
        format: "csv",
      },
      "https://app.openseo.so",
    );
    expect(url).toMatch(
      /^https:\/\/app\.openseo\.so\/api\/ai-visibility\/download\?projectId=project&exportId=/,
    );
  });

  it("writes each answer with its own mentions and citations", async () => {
    await seedRun("baseline", [
      {
        markdown: "OpenSEO",
        mentioned: ["OpenSEO"],
        sources: ["https://openseo.so/pricing"],
      },
      {
        markdown: "Ahrefs",
        mentioned: ["Ahrefs"],
        sources: ["https://ahrefs.com/blog"],
      },
    ]);
    await exportAiData(
      { ...query, includeHistory: false, competitorGap: false, format: "csv" },
      "https://app.openseo.so",
    );
    const csv = r2Put.mock.calls[0]?.[1];
    expect(csv?.split("\r\n").slice(1)).toEqual([
      expect.stringContaining(
        '"Question 0?","chatgpt","completed","","OpenSEO","https://openseo.so/pricing","OpenSEO"',
      ),
      expect.stringContaining(
        '"Question 1?","chatgpt","completed","","Ahrefs","https://ahrefs.com/blog","Ahrefs"',
      ),
    ]);
  });
});
