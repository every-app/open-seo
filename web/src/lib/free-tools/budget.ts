import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
  ALL_TOOLS_CALLS_PER_DAY,
  dataforseoCallsPerDay,
  PER_IP_CALLS_PER_DAY,
  reservedMicroDollarsPerCall,
} from "./spend";

const reservationSchema = z.object({
  tool: z.enum([
    "backlink-checker",
    "competitor-keyword-finder",
    "keyword-generator",
    "website-traffic-checker",
    "competitor-analysis",
    "spam-score-checker",
    "seo-report",
  ]),
  calls: z.number().int().min(1).max(6),
  visitor: z.string().regex(/^[a-f0-9]{64}$/),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type BudgetReservation = z.infer<typeof reservationSchema>;
type BudgetDecision = "allowed" | "visitor" | "tool" | "daily";

type BudgetEnv = { FREE_TOOLS_DAILY_BUDGET_USD: string };

/** One coordination object per UTC day's paid cache misses, not per request. */
export class FreeToolBudget extends DurableObject<BudgetEnv> {
  constructor(ctx: DurableObjectState, env: BudgetEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS counters (
      key TEXT PRIMARY KEY, calls INTEGER NOT NULL, micro_dollars INTEGER NOT NULL
    )`);
  }

  async reserve(input: BudgetReservation): Promise<BudgetDecision> {
    const { tool, calls, visitor, day } = reservationSchema.parse(input);
    const dollars = Number(this.env.FREE_TOOLS_DAILY_BUDGET_USD);
    if (
      !Number.isFinite(dollars) ||
      dollars < 0 ||
      !this.env.FREE_TOOLS_DAILY_BUDGET_USD?.trim()
    ) {
      throw new Error("Missing or invalid free tools daily budget");
    }
    // Old daily objects and their hashed visitor counters expire automatically.
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(
        Date.parse(`${day}T00:00:00Z`) + 3 * 86_400_000,
      );
    }
    // Fail closed if an RPC crossed midnight; never charge tomorrow's work
    // against yesterday's separate object.
    if (day !== new Date().toISOString().slice(0, 10)) {
      throw new Error("Budget reservation crossed UTC midnight; retry");
    }
    const cost = reservedMicroDollarsPerCall[tool] * calls;
    return this.ctx.storage.transactionSync(() => {
      const counters = [
        {
          key: "all",
          ceiling: ALL_TOOLS_CALLS_PER_DAY,
          reason: "daily" as const,
        },
        {
          key: `tool:${tool}`,
          ceiling: dataforseoCallsPerDay[tool],
          reason: "tool" as const,
        },
        {
          key: `visitor:${visitor}`,
          ceiling: PER_IP_CALLS_PER_DAY,
          reason: "visitor" as const,
        },
      ];
      for (const counter of counters) {
        const previous = this.ctx.storage.sql
          .exec<{
            calls: number;
            micro_dollars: number;
          }>(
            "SELECT calls, micro_dollars FROM counters WHERE key = ?",
            counter.key,
          )
          .toArray()[0];
        if ((previous?.calls ?? 0) + calls > counter.ceiling) {
          console.warn(
            JSON.stringify({
              event: "free_tool_limit_reached",
              limit: `${counter.reason}_calls`,
              tool,
              day,
              usedCalls: previous?.calls ?? 0,
              requestedCalls: calls,
              limitCalls: counter.ceiling,
            }),
          );
          return counter.reason;
        }
        if (
          counter.key === "all" &&
          (previous?.micro_dollars ?? 0) + cost >
            Math.floor(dollars * 1_000_000)
        ) {
          console.warn(
            JSON.stringify({
              event: "free_tool_limit_reached",
              limit: "daily_spend",
              tool,
              day,
              usedEstimatedUsd: (previous?.micro_dollars ?? 0) / 1_000_000,
              requestedEstimatedUsd: cost / 1_000_000,
              limitUsd: dollars,
            }),
          );
          return "daily";
        }
      }
      for (const counter of counters) {
        this.ctx.storage.sql.exec(
          `INSERT INTO counters (key, calls, micro_dollars) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET calls = calls + excluded.calls,
             micro_dollars = micro_dollars + excluded.micro_dollars`,
          counter.key,
          calls,
          cost,
        );
      }
      return "allowed";
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
