// A stand-in for the SEO report desk's Durable Object state, so the real
// class runs in a plain Node test: its SQL is evaluated by node:sqlite, and
// its transactions are real ones.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { vi } from "vitest";
import type { SeoReportEnv } from "../src/lib/seo-report/config";
import { SeoReportDesk, type StoredReport } from "../src/lib/seo-report/desk";

/**
 * A model the tool can start with: one that has prices
 * (SEO_REPORT_MODEL_PRICES). The tests' arithmetic uses them: $2.50 a million
 * tokens in, $0.10 from the cache, $10 out, and double from 272,000.
 */
export const MODEL = {
  SEO_REPORT_MODEL: "openai/gpt-6.2-sol",
  SEO_REPORT_MODEL_EFFORT: "medium",
};

function fakeState() {
  const db = new DatabaseSync(":memory:");
  return {
    storage: {
      sql: {
        exec(query: string, ...values: SQLInputValue[]) {
          if (!values.length && !/^\s*SELECT/i.test(query)) {
            db.exec(query);
            return { toArray: () => [] };
          }
          const statement = db.prepare(query);
          if (/^\s*SELECT/i.test(query)) {
            const rows = statement.all(...values);
            return { toArray: () => rows };
          }
          statement.run(...values);
          return { toArray: () => [] };
        },
      },
      transactionSync<T>(work: () => T): T {
        db.exec("BEGIN");
        try {
          const result = work();
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
      setAlarm: vi.fn(async () => {}),
    },
    waitUntil: () => {},
  };
}

export const report = (site: string): StoredReport => ({
  site,
  title: `Search opportunity for ${site}`,
  headline: "About 900 searches a month are within reach.",
  standing: null,
  customer: "a founder who wants more customers from search",
  moves: [
    {
      action: "Publish a pricing page",
      page: null,
      keyword: "example pricing",
      searches: 900,
      difficulty: 20,
      holders: "Rival #1, a comparison.",
      steps: ["Add a table of plans."],
      why: "Easiest page one in the plan.",
    },
  ],
  markdown: "A finding.",
  hosts: [],
  writtenAt: "2026-11-18T00:00:00.000Z",
});

/** The desk with stand-ins for the budget and the Workflow, and every email Loops was asked to send. */
export function deskWorld() {
  const reserve = vi.fn(async (_: { tool: string }) => "allowed");
  /** The runs a Workflow was started for, in order. */
  const started: { id: string; site: string }[] = [];
  const env = {
    SEO_REPORT_PARTNER_ORIGINS: "",
    ...MODEL,
    OPENROUTER_API_KEY: "openrouter-key",
    DATAFORSEO_API_KEY: "dataforseo-key",
    LOOPS_API_KEY: "loops-key",
    LOOPS_SEO_REPORT_READY_ID: "ready-template",
    LOOPS_SEO_REPORT_FAILED_ID: "failed-template",
    FREE_TOOL_BUDGET: { getByName: () => ({ reserve }) },
    SEO_REPORT_WORKFLOW: {
      create: async (run: { id: string; params: { site: string } }) => {
        started.push({ id: run.id, site: run.params.site });
      },
      get: async () => ({ terminate: async () => {} }),
    },
  } as unknown as SeoReportEnv;

  const emails: {
    transactionalId: string;
    email: string;
    addToAudience: boolean;
    dataVariables: Record<string, string>;
  }[] = [];
  /** What Loops answers. Change it to make sends fail. */
  const loops = { status: 200 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_: string, init: RequestInit) => {
      if (loops.status === 200) emails.push(JSON.parse(String(init.body)));
      return new Response(null, { status: loops.status });
    }),
  );

  const desk = new SeoReportDesk(
    fakeState() as unknown as DurableObjectState,
    env,
  );
  let asked = 0;
  /** A request from a mailbox and network of its own, unless told otherwise. */
  const ask = (
    site: string,
    from: { mailbox?: string; network?: string } = {},
  ) => {
    asked += 1;
    return desk.ask({
      site,
      email: `person-${asked}@inbox.test`,
      source: "openseo.so/seo-report",
      mailbox: from.mailbox ?? `mailbox-${asked}`,
      network: from.network ?? `network-${asked}`,
    });
  };
  return { desk, env, ask, reserve, started, emails, loops };
}
