import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {}, DurableObject: class {} }));
const scripted = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock("../src/lib/seo-report/model", () => ({
  reportModel: async () => scripted.model,
}));
import type { SeoReportEnv } from "../src/lib/seo-report/config";
import { REPORT_LIMITS } from "../src/lib/seo-report/limits";
import { SUBMIT_TOOL } from "../src/lib/seo-report/tools";
import { writeReport } from "../src/lib/seo-report/write";
import { MODEL } from "./seo-report-support";

// What the model can do while it writes a report, and where each limit stops
// it. The model is scripted here; DataForSEO and the site are fetch stand-ins.
// A report is handed in twice: a draft, then the draft edited. A script's
// last reply repeats, so one hand-in stands for a draft the edit left alone.

const env = {
  DATAFORSEO_API_KEY: "dataforseo-key",
  ...MODEL,
} as unknown as SeoReportEnv;
type Call = { name: string; input: unknown };
/** One reply from the model: the tools it calls, what it used and what it cost. */
// `usd` is what OpenRouter says it charged; null is a reply that doesn't say.
// `cached` of the tokens were read from the cache. Null `tokens` is a reply
// that doesn't say how many it used.
const reply = (
  calls: Call[],
  tokens: number | null = 1000,
  usd: number | null = 0.01,
  cached = 0,
) => ({
  content: calls.map((call, index) => ({
    type: "tool-call" as const,
    toolCallId: `call-${index}`,
    toolName: call.name,
    input: JSON.stringify(call.input),
  })),
  finishReason: { unified: "tool-calls" as const, raw: undefined },
  usage: {
    inputTokens: {
      total: tokens ?? undefined,
      noCache: tokens === null ? undefined : tokens - cached,
      cacheRead: cached,
      cacheWrite: 0,
    },
    outputTokens: {
      total: tokens === null ? undefined : 0,
      text: 0,
      reasoning: 0,
    },
  },
  providerMetadata:
    usd === null
      ? undefined
      : { openrouter: { provider: "OpenAI", usage: { cost: usd } } },
  warnings: [],
});
const report = {
  status: "done",
  reason: null,
  markdown: "# Search opportunity for example.com\n\nA finding.",
  headline: "About 900 searches a month are within reach.",
  standing: null,
  customer: "a founder who wants more customers from search",
  moves: [
    {
      action: "Publish a pricing page",
      page: null,
      keyword: "example pricing",
      searches: 900,
      difficulty: null,
      holders: "Rival #1, a comparison.",
      steps: ["Add a table of plans."],
      why: "Easiest page one in the plan.",
    },
  ],
};
const handIn = (input: unknown = report) =>
  reply([{ name: SUBMIT_TOOL, input }]);
const many = <T>(count: number, make: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => make(index));

/** The replies the model gives, in order. The last one repeats. */
function script(...replies: ReturnType<typeof reply>[]) {
  let turn = 0;
  scripted.model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      asked.push(options.maxOutputTokens);
      told.push(JSON.stringify(options.prompt.at(-1)));
      return replies[Math.min(turn++, replies.length - 1)]!;
    },
  });
  return () => turn;
}
/** The output cap each model call was made with, and the last thing it was told. */
const asked: (number | undefined)[] = [];
const told: string[] = [];

/** Every request the run made to DataForSEO, and every page it asked the site for. */
const lookups: { path: string; payload: Record<string, unknown> }[] = [];
const pagesRead: string[] = [];
let failures: ReturnType<typeof vi.spyOn>;
const readAPage = { name: "read_page", input: { url: "https://example.com/" } };

beforeEach(() => {
  asked.length = 0;
  told.length = 0;
  failures = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  lookups.length = 0;
  pagesRead.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname !== "api.dataforseo.com") {
        if (url.pathname === "/robots.txt")
          return new Response("", { status: 404 });
        pagesRead.push(url.href);
        return new Response("A page.", {
          headers: { "Content-Type": "text/html" },
        });
      }
      const [payload] = JSON.parse(String(init?.body));
      lookups.push({ path: url.pathname, payload });
      // A results page names one site; every other answer is empty.
      const items = url.pathname.includes("/serp/")
        ? [
            {
              type: "organic",
              rank_group: 1,
              domain: "www.rival.example",
              title: "Rival",
              url: "https://www.rival.example/",
            },
          ]
        : [];
      return Response.json({
        tasks: [{ status_code: 20000, cost: 0.01, result: [{ items }] }],
      });
    }),
  );
});

afterEach(() => vi.useRealTimers());

const failureLogged = () => JSON.parse(String(failures.mock.calls.at(-1)?.[0]));
const reasonLogged = () => failureLogged().reason;

/** A model whose provider turns away every call from `failFrom` to `failUntil`. */
function providerFails(failFrom: number, failUntil: number) {
  const seen: number[] = [];
  scripted.model = new MockLanguageModelV3({
    doGenerate: async ({ prompt }) => {
      seen.push(prompt.length);
      if (seen.length === 1)
        return reply([
          { name: "research_keywords", input: { seeds: ["a *"] } },
        ]);
      if (seen.length >= failFrom && seen.length <= failUntil)
        throw new APICallError({
          message: "rate-limited upstream",
          url: "https://openrouter.ai/api/v1/chat/completions",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: false,
        });
      return handIn();
    },
  });
  return seen;
}
/** Runs a report through the pause before it is picked up again. */
async function writeThroughThePause() {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const writing = writeReport(env, "example.com");
  await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
  await vi.advanceTimersByTimeAsync(30_000);
  return writing;
}

it("picks a run the provider dropped back up with the research it had, instead of buying it again", async () => {
  const seen = providerFails(2, 2);
  expect(await writeThroughThePause()).toMatchObject({ site: "example.com" });
  expect(
    lookups.filter(({ path }) => path.includes("keyword_suggestions")),
  ).toHaveLength(1);
  // The prompt alone; then with the research call and its answer, twice;
  // then with the draft, its receipt and the request to edit it.
  expect(seen).toEqual([1, 3, 3, 6]);
});

it("gives a dropped run one more try, then says the provider failed", async () => {
  const seen = providerFails(2, 99);
  expect(await writeThroughThePause()).toBe("failed");
  expect(seen).toHaveLength(3);
  expect(failureLogged()).toMatchObject({ side: "provider", dataUsd: 0.01 });
});

it("hands back the report with the sites its results pages named", async () => {
  script(
    reply([
      { name: "get_domain_overview", input: { domain: "attacker.example" } },
      { name: "research_keywords", input: { seeds: ["attacker.example *"] } },
      { name: "get_serp_results", input: { keywords: ["crm for plumbers"] } },
    ]),
    handIn(),
  );
  const written = await writeReport(env, "example.com");
  expect(written).toMatchObject({
    site: "example.com",
    title: "Search opportunity for example.com",
    headline: report.headline,
    markdown: report.markdown,
    // Not the host the model asked about: only what a result's own field said.
    hosts: ["rival.example"],
  });
});

it("holds every lookup to the size the budget was reserved for, whatever the model asks", async () => {
  script(
    reply([
      {
        name: "get_keyword_metrics",
        input: { keywords: many(200, (i) => `keyword ${i}`) },
      },
      {
        name: "research_keywords",
        input: { seeds: many(9, (i) => `seed ${i} *`) },
      },
      {
        name: "get_serp_results",
        input: { keywords: many(12, (i) => `query ${i}`) },
      },
      {
        name: "get_domain_keyword_suggestions",
        input: { domain: "example.com" },
      },
    ]),
    handIn(),
  );
  await writeReport(env, "example.com");
  const sent = (part: string) =>
    lookups.filter(({ path }) => path.includes(part));
  expect(sent("keyword_overview")).toHaveLength(1);
  expect(sent("keyword_overview")[0]!.payload.keywords).toHaveLength(60);
  expect(sent("keyword_suggestions")).toHaveLength(4);
  for (const { payload } of sent("keyword_suggestions"))
    expect(payload).toMatchObject({
      limit: 150,
      include_clickstream_data: false,
      location_code: 2840,
    });
  // Five keywords, each read three times, page one only.
  expect(sent("/serp/")).toHaveLength(15);
  for (const { payload } of sent("/serp/")) expect(payload.depth).toBe(10);
  expect(sent("ranked_keywords")[0]!.payload.limit).toBe(100);
});

it("refuses a tool once it has had its calls, and reads no more than twelve pages", async () => {
  script(
    reply([
      ...many(3, () => ({
        name: "get_domain_overview",
        input: { domain: "example.com" },
      })),
      ...many(3, () => ({
        name: "research_keywords",
        input: { seeds: ["a *"] },
      })),
      ...many(5, () => ({
        name: "get_keyword_metrics",
        input: { keywords: ["a"] },
      })),
      ...many(5, () => ({
        name: "get_serp_results",
        input: { keywords: ["a"] },
      })),
      ...many(20, (i) => ({
        name: "read_page",
        input: { url: `https://example.com/${i}` },
      })),
    ]),
    handIn(),
  );
  expect(await writeReport(env, "example.com")).toMatchObject({
    site: "example.com",
  });
  const sent = (part: string) =>
    lookups.filter(({ path }) => path.includes(part)).length;
  expect(sent("domain_rank_overview")).toBe(1);
  expect(sent("keyword_suggestions")).toBe(1);
  expect(sent("keyword_overview")).toBe(3);
  expect(sent("/serp/")).toBe(3 * 3);
  expect(pagesRead).toHaveLength(REPORT_LIMITS.pages);
});

it("never sends DataForSEO a keyword with a search operator, which it charges five times for", async () => {
  script(
    reply([
      {
        name: "get_serp_results",
        input: {
          keywords: [
            "site:example.com pricing",
            "crm for plumbers",
            "INTITLE:crm",
            "allinurl: crm",
          ],
        },
      },
      {
        name: "get_serp_results",
        input: { keywords: ["inurl:blog crm", "cache:example.com"] },
      },
    ]),
    handIn(),
  );
  await writeReport(env, "example.com");
  const keywords = lookups
    .filter(({ path }) => path.includes("/serp/"))
    .map(({ payload }) => payload.keyword);
  expect(keywords).toEqual(Array(3).fill("crm for plumbers"));
});

it("ends without a report at the model-call limit", async () => {
  const turns = script(reply([readAPage]));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(REPORT_LIMITS.modelCalls);
  expect(reasonLogged()).toMatch(/reached a limit/);
});

it("ends without a report at the token limit", async () => {
  // Read from the cache, so the tokens run out long before the dollar does.
  const half = REPORT_LIMITS.tokens / 2;
  const turns = script(reply([readAPage], half, 0, half));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(2);
});

it("stops before a model call that could take the run past a dollar", async () => {
  // $0.60 spent, and the conversation is now 100,000 tokens: the next call
  // could cost $0.25 to read them and $0.16 to write 16,000 more.
  const turns = script(reply([readAPage], 100_000, 0.6));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(1);
});

it("charges a long conversation at the long rates when it looks ahead", async () => {
  // 280,000 tokens is past where the price doubles: $1.40 in, $0.24 out.
  const turns = script(reply([readAPage], 280_000, 0));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(1);
  // At the short rates the same check would let 150,000 tokens through.
  const shorter = script(reply([readAPage], 150_000, 0), handIn());
  expect(await writeReport(env, "example.com")).toMatchObject({
    site: "example.com",
  });
  expect(shorter()).toBe(3);
});

it("caps what every model call may write", async () => {
  script(reply([readAPage]), handIn());
  await writeReport(env, "example.com");
  expect(asked).toEqual([16_000, 16_000, 16_000]);
});

it("counts what the model cost from its tokens and stops at a dollar, whether or not OpenRouter says", async () => {
  // 100,000 tokens a call is $0.25 at $2.50 a million, and the next call
  // could cost $0.41: after three calls, $0.75 spent, a fourth could pass $1.
  const turns = script(reply([readAPage], 100_000, null));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(3);
  expect(failureLogged()).toMatchObject({ modelUsd: 0.75, chargedUsd: 0 });
});

it("prices tokens read from the cache at their own rate", async () => {
  // 10,000 at $2.50 a million and 90,000 at $0.10, then two hand-ins.
  script(reply([readAPage], 100_000, null, 90_000), handIn());
  await writeReport(env, "example.com");
  const written = JSON.parse(
    String(vi.mocked(console.log).mock.calls.at(-1)?.[0]),
  );
  expect(written.countedUsd).toBeCloseTo(0.034 + 2 * 0.0025, 4);
});

it("goes by OpenRouter's figure when it is the larger, and says when the two are far apart", async () => {
  const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
  // 1,000 tokens count as a quarter of a cent; OpenRouter says 60 cents.
  const turns = script(reply([readAPage], 1000, 0.6));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(2);
  expect(JSON.parse(String(warned.mock.calls.at(-1)?.[0]))).toMatchObject({
    event: "seo_report_cost_mismatch",
    model: "openai/gpt-6.2-sol",
    chargedUsd: 1.2,
  });
});

it("fails a run whose model reply doesn't say how many tokens it used, even one that hands a report in", async () => {
  const turns = script(reply([readAPage], null, null), handIn());
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(1);
  script(reply([{ name: SUBMIT_TOOL, input: report }], null, 0.01));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(failureLogged()).toMatchObject({ side: "provider" });
});

it("gives a run that is picked up again no calls beyond its limit", async () => {
  let turn = 0;
  scripted.model = new MockLanguageModelV3({
    doGenerate: async () => {
      turn += 1;
      // The provider fails the last call the run is allowed, once.
      if (turn === REPORT_LIMITS.modelCalls)
        throw new APICallError({
          message: "rate-limited upstream",
          url: "https://openrouter.ai/api/v1/chat/completions",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: false,
        });
      return reply([readAPage], 100, 0);
    },
  });
  expect(await writeThroughThePause()).toBe("failed");
  expect(failureLogged().modelCalls).toBe(REPORT_LIMITS.modelCalls);
});

it("passes on a listed reason for stopping, and nothing else the model says", async () => {
  script(
    handIn({
      ...report,
      status: "blocked",
      reason: "not_united_states",
      markdown: "",
    }),
  );
  expect(await writeReport(env, "example.com")).toBe("not_united_states");
  expect(failureLogged()).toMatchObject({ side: "site" });
});

it.each([
  ["doesn't fit the shape", { ...report, moves: "many" }],
  ["has no plan", { ...report, moves: [] }],
  ["carries a field nobody asked for", { ...report, html: "<script>" }],
  ["says it was blocked and not why", { ...report, status: "blocked" }],
  [
    "gives a reason that isn't on the list",
    { ...report, status: "blocked", reason: "call 1-800-555-0100" },
  ],
  ["says it is done and gives a reason", { ...report, reason: "closed" }],
  ["is empty", { ...report, markdown: " " }],
])("writes no report when what is handed in %s", async (_, submission) => {
  script(handIn(submission));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(failures).toHaveBeenCalled();
});

const move = report.moves[0]!;
const edited = {
  ...report,
  headline: "About 900 searches a month.",
  moves: [{ ...move, why: "Easiest page one." }],
};

it("logs which host answered and how much the model reasoned", async () => {
  script(handIn());
  await writeReport(env, "example.com");
  expect(
    JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0])),
  ).toMatchObject({ providers: ["OpenAI"], reasoningTokens: 0 });
});

it("has the model edit its draft with the clean-copy skill, and sends the edit", async () => {
  const turns = script(handIn(), handIn(edited));
  expect(await writeReport(env, "example.com")).toMatchObject({
    headline: edited.headline,
    moves: edited.moves,
  });
  expect(turns()).toBe(2);
  expect(told[1]).toContain("should this exist");
});

it("refuses an edit that changes the plan's data, says what differed, and takes the next one", async () => {
  const turns = script(
    handIn(),
    handIn({ ...report, moves: [{ ...move, searches: 9000 }] }),
    handIn(edited),
  );
  expect(await writeReport(env, "example.com")).toMatchObject({
    headline: edited.headline,
  });
  expect(turns()).toBe(3);
  expect(told[2]).toContain("move 1's searches was 900 and the edit has 9000");
});

// The same hand-in repeats, so the edit is refused and then fails.
it.each([
  ["a keyword", [{ ...move, keyword: "example prices" }]],
  ["its searches", [{ ...move, searches: 9000 }]],
  ["its difficulty", [{ ...move, difficulty: 10 }]],
  ["its page", [{ ...move, page: "https://example.com/pricing" }]],
  ["how many moves there are", [move, move]],
])("writes no report when the edit changes %s twice", async (_, moves) => {
  const turns = script(handIn(), handIn({ ...report, moves }));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(3);
  expect(reasonLogged()).toMatch(/changed the plan's data twice/);
});

it("writes no report when the edit swaps two moves twice", async () => {
  const second = { ...move, keyword: "example plans" };
  script(
    handIn({ ...report, moves: [move, second] }),
    handIn({ ...report, moves: [second, move] }),
  );
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(reasonLogged()).toMatch(/changed the plan's data twice/);
});

it("holds the edit to the shape the draft was held to", async () => {
  script(handIn(), handIn({ ...report, markdown: " " }));
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(reasonLogged()).toMatch(/empty/);
});

it("ends without a report when the draft uses the last of an allowance", async () => {
  // Read from the cache, so it is the tokens that run out.
  const all = REPORT_LIMITS.tokens;
  const turns = script(
    reply([{ name: SUBMIT_TOOL, input: report }], all, 0, all),
  );
  expect(await writeReport(env, "example.com")).toBe("failed");
  expect(turns()).toBe(1);
  expect(reasonLogged()).toMatch(/before the report was edited/);
});
