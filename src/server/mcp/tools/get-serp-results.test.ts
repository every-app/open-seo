import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSerpResultsTool } from "./get-serp-results";
import { makeToolContext, textContent } from "./tool-test-support";
import { serpSchema } from "@/shared/mcp-contracts";
import type * as r2CacheModule from "@/server/lib/r2-cache";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  fetchSerpTaskResult: vi.fn(),
  getProjectForOrganization: vi.fn(),
  cache: new Map<string, unknown>(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/r2-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof r2CacheModule>()),
  getCached: async (key: string) => mocks.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, value);
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  fetchSerpTaskResult: mocks.fetchSerpTaskResult,
  SERP_ANALYSIS_DEPTH: 10,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();
const args = { projectId: "project_1", queries: [{ keyword: "seo tools" }] };

function organic(position: number, domain: string | null, title = "Page") {
  return {
    type: "organic",
    rank_group: position,
    rank_absolute: position + 1,
    title,
    url: `https://${domain}/`,
    domain,
    description: "desc",
  };
}

/** Each query posts reads "t1".."t3"; `reads` answers them by task id. */
function mockReads(reads: Record<string, unknown>) {
  const post = vi.fn<(input: unknown) => Promise<string[]>>(async () =>
    Object.keys(reads),
  );
  mocks.createDataforseoClient.mockReturnValue({
    serp: {
      readsTaskPostBatch: (inputs: unknown[]) =>
        Promise.allSettled(inputs.map((input) => post(input))),
    },
  });
  mocks.fetchSerpTaskResult.mockImplementation(async (id: string) => reads[id]);
  return post;
}

const completed = (...items: unknown[]) => ({ status: "completed", items });

/** Runs fake time forward until a call that's polling has answered. */
async function untilAnswered<T>(call: Promise<T>) {
  const state = { answered: false };
  void call.finally(() => {
    state.answered = true;
  });
  while (!state.answered) await vi.advanceTimersByTimeAsync(3000);
  return call;
}

function itemsOf(result: { structuredContent?: unknown }) {
  const [first] = serpSchema.parse(result.structuredContent).results;
  if (!first.ok) throw new Error(first.error);
  return first.items;
}

describe("get_serp_results", () => {
  beforeEach(() => {
    mocks.cache.clear();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges the reads: sites they agree on first, each at its best position", async () => {
    mockReads({
      t1: completed(organic(1, "poisoned.example"), organic(4, "agreed.com")),
      // A goto row's breadcrumb host has no www, but it's the same site.
      t2: completed(organic(2, "www.agreed.com"), organic(3, "second.com")),
      t3: completed(organic(5, "agreed.com"), organic(6, "second.com")),
    });

    const result = await getSerpResultsTool.handler(args, toolContext);

    expect(
      itemsOf(result).map(({ rank, domain, bestPosition, seenIn }) => [
        rank,
        domain,
        bestPosition,
        seenIn,
      ]),
    ).toEqual([
      [1, "www.agreed.com", 2, 3],
      [2, "second.com", 3, 2],
      [3, "poisoned.example", 1, 1],
    ]);
  });

  it("counts a site once per read and lists SERP features after the organic rows", async () => {
    const feature = { type: "people_also_ask", rank_absolute: 2 };
    mockReads({
      t1: completed(feature, organic(1, "a.com"), organic(2, "a.com")),
      t2: completed(organic(1, "a.com"), feature),
    });

    const result = await getSerpResultsTool.handler(args, toolContext);

    expect(
      itemsOf(result).map(({ type, rank, bestPosition, seenIn }) => [
        type,
        rank,
        bestPosition,
        seenIn,
      ]),
    ).toEqual([
      ["organic", 1, 1, 2],
      ["people_also_ask", null, null, 2],
    ]);
  });

  it("reads to the requested depth and returns every merged site", async () => {
    const post = mockReads({
      t1: completed(organic(1, "a.com"), organic(2, "b.com")),
      t2: completed(organic(1, "c.com"), organic(2, "d.com")),
    });

    const result = await getSerpResultsTool.handler(
      { ...args, depth: 30 },
      toolContext,
    );

    expect(post).toHaveBeenCalledWith(expect.objectContaining({ depth: 30 }));
    expect(textContent(result)).toContain('"seo tools" (4 results)');
  });

  it("collects the same reads on a repeat instead of paying again", async () => {
    const post = mockReads({ t1: completed(organic(1, "a.com")) });

    const first = await getSerpResultsTool.handler(args, toolContext);
    const repeat = await getSerpResultsTool.handler(args, toolContext);

    expect(post).toHaveBeenCalledTimes(1);
    expect(repeat.structuredContent).toEqual(first.structuredContent);
  });

  it("posts a mobile SERP separately from a desktop one", async () => {
    const post = mockReads({ t1: completed(organic(1, "a.com")) });

    await getSerpResultsTool.handler(args, toolContext);
    await getSerpResultsTool.handler(
      { ...args, queries: [{ keyword: "seo tools", device: "mobile" }] },
      toolContext,
    );

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ device: "mobile" }),
    );
  });

  it("answers with the reads that are back, and a repeat merges in the late one", async () => {
    vi.useFakeTimers();
    const reads = {
      t1: completed(organic(1, "a.com")),
      t2: { status: "pending" } as object,
    };
    const post = mockReads(reads);

    const first = await untilAnswered(
      getSerpResultsTool.handler(args, toolContext),
    );
    expect(itemsOf(first)[0]).toMatchObject({ seenIn: 1 });

    reads.t2 = completed(organic(1, "a.com"));
    const repeat = await untilAnswered(
      getSerpResultsTool.handler(args, toolContext),
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect(itemsOf(repeat)[0]).toMatchObject({ seenIn: 2 });
  });

  it("says to call again when no read is back, without charging for the repeat", async () => {
    vi.useFakeTimers();
    const reads: Record<string, object> = { t1: { status: "pending" } };
    const post = mockReads(reads);

    const first = await untilAnswered(
      getSerpResultsTool.handler(args, toolContext),
    );
    expect(textContent(first)).toContain("at no extra charge");

    reads.t1 = completed(organic(1, "a.com"));
    const repeat = await untilAnswered(
      getSerpResultsTool.handler(args, toolContext),
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect(itemsOf(repeat)).toHaveLength(1);
  });

  it("buys fresh reads after every read failed or came back empty", async () => {
    const reads: Record<string, object> = {
      t1: { status: "failed", message: "Internal Error." },
    };
    const post = mockReads(reads);

    const failed = await getSerpResultsTool.handler(args, toolContext);
    expect(textContent(failed)).toContain("Internal Error.");

    reads.t1 = completed();
    const empty = await getSerpResultsTool.handler(args, toolContext);
    expect(textContent(empty)).toContain("(0 results)");

    reads.t1 = completed(organic(1, "a.com"));
    await getSerpResultsTool.handler(args, toolContext);

    expect(post).toHaveBeenCalledTimes(3);
  });
});
