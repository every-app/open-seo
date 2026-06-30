import { getDatabaseProvider } from "./provider";
import { d1Db } from "./d1/client";
import { pgDb } from "./pg/client";

// The executor handed to the `build` callback. Typed as the D1 client so call
// sites get full Drizzle inference; at runtime it is either `d1Db` or a Postgres
// transaction handle.
type BatchExecutor = typeof d1Db;
type BatchStatement = Parameters<typeof d1Db.batch>[0][number];

// D1 caps bound parameters at ~100 per statement; keep batches bounded so each
// runBatch call stays under that limit. (Postgres allows far more, but the same
// chunk size is harmless there.)
const DB_BATCH_SIZE = 100;

/**
 * Run a set of write statements atomically on either backend.
 *
 * - D1: collected statements run via `db.batch([...])` (one atomic, ordered call).
 * - Postgres: statements run sequentially inside `db.transaction(tx => ...)`
 *   (atomic, and in array order to match D1's batch semantics).
 *
 * IMPORTANT: build statements from the `tx` handle the callback receives, NOT
 * the module-level `db`. On Postgres, statements built from the outer `db` would
 * execute outside the transaction. Returning the (unawaited) Drizzle query
 * builders is enough; they are thenables on both dialects.
 */
export async function runBatch(
  build: (tx: BatchExecutor) => readonly Promise<unknown>[],
): Promise<void> {
  if (getDatabaseProvider() === "postgres") {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pg tx exposes the same query builder surface as d1Db
    const pg = pgDb as unknown as {
      transaction: (
        fn: (tx: BatchExecutor) => Promise<unknown>,
      ) => Promise<unknown>;
    };
    await pg.transaction(async (tx) => {
      // Sequential to mirror D1's ordered batch contract.
      for (const statement of build(tx)) await statement;
    });
    return;
  }

  const statements = build(d1Db);
  if (statements.length === 0) return;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- d1 query builders are BatchItems; length checked above
  const batch = statements as unknown as [BatchStatement, ...BatchStatement[]];
  await d1Db.batch(batch);
}

/**
 * Chunk `items` into D1-safe batches and run each chunk atomically via
 * `runBatch`. Shared by repositories that bulk-insert/update (audit pages,
 * rank snapshots, etc.).
 */
export async function executeInBatches<T>(
  items: T[],
  buildStatement: (tx: BatchExecutor, item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += DB_BATCH_SIZE) {
    const chunk = items.slice(i, i + DB_BATCH_SIZE);
    if (chunk.length === 0) continue;
    await runBatch((tx) => chunk.map((item) => buildStatement(tx, item)));
  }
}
