/* oxlint-disable typescript/no-unsafe-type-assertion -- The lazy query stand-in mirrors postgres.js's PendingQuery surface, which has no constructible type. */
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
type PendingUnsafe = ReturnType<Sql["unsafe"]>;

/**
 * Per-query retry for transient connection failures.
 *
 * PlanetScale HA operations (cluster resizes, image upgrades, unplanned
 * failovers) terminate every connection when the primary moves, with the
 * cutover completing in under ~5 seconds. Hyperdrive reconnects transparently
 * for new queries, but a query in flight — or one issued before the new
 * primary accepts connections — fails with a connection error. This wrapper
 * retries those instead of failing the whole request.
 *
 * Safety: a write may have committed even though the connection died before
 * the response arrived, so writes are only retried on errors that occur
 * strictly before the query reaches the server (connect-phase failures).
 * Selects are retried on any transient connection error. Transactions
 * (`db.transaction` → `sql.begin`) are not retried: postgres.js hands the
 * transaction callback a raw connection-scoped client that bypasses this
 * wrapper, and replaying a partially applied transaction is not safe.
 */

// postgres.js client-side codes, socket errno codes, and Postgres server codes
// that mean the connection died or the server is briefly unavailable — not
// that the query is invalid.
const TRANSIENT_ERROR_CODES = new Set([
  // postgres.js (src/errors.js)
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
  // socket errno
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  // Postgres class 08 (connection exception)
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08P01",
  // shutdown / failover: admin_shutdown, crash_shutdown, cannot_connect_now
  "57P01",
  "57P02",
  "57P03",
]);

// Codes that can only occur before the server received the query, so a retry
// can never double-execute a write.
const PRE_EXECUTION_CODES = new Set([
  "CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "57P03", // cannot_connect_now (server starting up / mid-failover)
]);

// Spaced to ride out a PlanetScale primary cutover (< ~5s total), with jitter
// so concurrent requests don't reconnect in lockstep.
const RETRY_DELAYS_MS = [250, 1000, 2500];

function isRetryable(error: unknown, query: string): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !TRANSIENT_ERROR_CODES.has(code)) {
    return false;
  }
  if (PRE_EXECUTION_CODES.has(code)) {
    return true;
  }
  // The connection dropped with the query possibly in flight: the server may
  // have already executed it, so only replay statements that are safe to run
  // twice.
  return /^\s*select\b/i.test(query);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wrap a postgres.js client so `sql.unsafe` — the single entrypoint
 * drizzle-orm/postgres-js issues queries through — retries transient
 * connection errors. Everything else on the client passes through untouched.
 */
export function withQueryRetries(sql: Sql): Sql {
  const retryingUnsafe = ((query: string, ...rest: unknown[]) => {
    const run = () =>
      (sql.unsafe as (...args: unknown[]) => PendingUnsafe)(query, ...rest);

    const attempt = async <T>(
      execute: (pending: PendingUnsafe) => Promise<T> | T,
    ): Promise<T> => {
      for (let i = 0; ; i++) {
        try {
          return await execute(run());
        } catch (error) {
          if (i >= RETRY_DELAYS_MS.length || !isRetryable(error, query)) {
            throw error;
          }
          await sleep(RETRY_DELAYS_MS[i] + Math.random() * 250);
        }
      }
    };

    // Lazy stand-in for postgres.js's PendingQuery covering the surface
    // drizzle-orm/postgres-js uses (await, .values(), .execute(), .raw()).
    // Each accessor starts its own attempt so a retry re-issues a fresh query
    // on a fresh connection.
    const pending = {
      // oxlint-disable-next-line unicorn/no-thenable -- deliberately thenable: it stands in for postgres.js's PendingQuery, which is awaited directly
      then: (onFulfilled?: unknown, onRejected?: unknown) =>
        attempt((q) => q).then(
          onFulfilled as (value: unknown) => unknown,
          onRejected as (reason: unknown) => unknown,
        ),
      catch: (onRejected?: unknown) =>
        attempt((q) => q).catch(onRejected as (reason: unknown) => unknown),
      finally: (onFinally?: unknown) =>
        attempt((q) => q).finally(onFinally as () => void),
      values: () => attempt((q) => q.values()),
      raw: () => attempt((q) => q.raw()),
      execute: () => attempt((q) => q.execute()),
    };
    return pending as unknown as PendingUnsafe;
  }) as Sql["unsafe"];

  return new Proxy(sql, {
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return retryingUnsafe;
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}
