/**
 * Global daily spend cap for the free backlink checker.
 *
 * A Durable Object is the only primitive on Workers that makes this an actual
 * ceiling. It is one instance globally, and its input gates serialize the
 * read-modify-write below, so N concurrent reservations consume N units.
 *
 * The KV counter this replaces did a non-atomic read-modify-write against a
 * read-cached value: concurrent requests all read the same count, all passed
 * the check, and all billed DataForSEO while the stored count advanced by one.
 */

// Hard ceiling on paid DataForSEO lookups per day (~$0.04 each). Cached checks
// don't count. Bumping this is a deliberate spend decision.
export const DAILY_CHECK_BUDGET = 500;

const BUDGET_KEY = "budget";

// Single record, so the count resets at UTC midnight without a TTL and storage
// never grows.
type BudgetRecord = { day: string; used: number };

export type BudgetReservation = { allowed: boolean; used: number };

type DurableStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
};

export class BacklinkCheckBudget {
  #storage: DurableStorage;

  constructor(state: { storage: DurableStorage }) {
    this.#storage = state.storage;
  }

  async fetch(): Promise<Response> {
    const day = new Date().toISOString().slice(0, 10);
    const stored = await this.#storage.get<BudgetRecord>(BUDGET_KEY);
    const used = stored?.day === day ? stored.used : 0;

    if (used >= DAILY_CHECK_BUDGET) {
      return Response.json({ allowed: false, used } satisfies BudgetReservation);
    }

    const next = used + 1;
    await this.#storage.put<BudgetRecord>(BUDGET_KEY, { day, used: next });
    return Response.json({
      allowed: true,
      used: next,
    } satisfies BudgetReservation);
  }
}
