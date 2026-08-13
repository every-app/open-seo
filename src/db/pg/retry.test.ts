/* oxlint-disable typescript/no-unsafe-type-assertion -- fakes stand in for the postgres.js client */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { withQueryRetries } from "./retry";

type Sql = ReturnType<typeof postgres>;

function connectionError(code: string): Error {
  return Object.assign(new Error(`${code}: boom`), { code });
}

/**
 * Build a fake postgres.js client whose `unsafe` fails `failures` times with
 * `error` before succeeding. Each unsafe() call returns a fresh thenable
 * exposing the PendingQuery surface the wrapper covers.
 */
function fakeSql(failures: number, error: Error) {
  let calls = 0;
  const unsafe = vi.fn(() => {
    calls++;
    const outcome =
      calls <= failures ? Promise.reject(error) : Promise.resolve([{ ok: 1 }]);
    // Swallow the bare rejection; the wrapper observes it via then/values/etc.
    void outcome.catch(() => {});
    return {
      // oxlint-disable-next-line unicorn/no-thenable -- mirrors postgres.js's awaitable PendingQuery
      then: (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
        outcome.then(f, r),
      values: () => outcome,
      raw: () => outcome,
      execute: () => outcome,
    };
  });
  const sql = { unsafe, options: { parsers: {}, serializers: {} } };
  return { sql: sql as unknown as Sql, unsafe };
}

/**
 * The wrapper's pending query is lazy — the attempt only starts once a
 * handler is attached. Attach one immediately (so retries are in flight
 * before the fake timers advance) and silence unhandled-rejection noise.
 */
function start<T>(thenable: PromiseLike<T>): Promise<T> {
  const started = new Promise<T>((resolve, reject) =>
    thenable.then(resolve, reject),
  );
  started.catch(() => {});
  return started;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// Generous enough to flush all retry delays (max ~4.5s including jitter).
const flushRetries = () => vi.advanceTimersByTimeAsync(10_000);

describe("withQueryRetries", () => {
  it("retries a select after a mid-flight connection loss", async () => {
    const { sql, unsafe } = fakeSql(1, connectionError("CONNECTION_CLOSED"));
    const rows = start(withQueryRetries(sql).unsafe("select 1"));
    await flushRetries();
    await expect(rows).resolves.toEqual([{ ok: 1 }]);
    expect(unsafe).toHaveBeenCalledTimes(2);
  });

  it("retries the .values() path drizzle uses", async () => {
    const { sql, unsafe } = fakeSql(1, connectionError("ECONNRESET"));
    const rows = start(withQueryRetries(sql).unsafe('select "id"').values());
    await flushRetries();
    await expect(rows).resolves.toEqual([{ ok: 1 }]);
    expect(unsafe).toHaveBeenCalledTimes(2);
  });

  it("does not retry a write after a mid-flight connection loss", async () => {
    const error = connectionError("CONNECTION_CLOSED");
    const { sql, unsafe } = fakeSql(1, error);
    const insert = start(
      withQueryRetries(sql).unsafe('insert into "session" values ($1)'),
    );
    await flushRetries();
    await expect(insert).rejects.toBe(error);
    expect(unsafe).toHaveBeenCalledTimes(1);
  });

  it("retries a write on a connect-phase failure (query never sent)", async () => {
    const { sql, unsafe } = fakeSql(2, connectionError("CONNECT_TIMEOUT"));
    const insert = start(
      withQueryRetries(sql).unsafe('insert into "session" values ($1)'),
    );
    await flushRetries();
    await expect(insert).resolves.toEqual([{ ok: 1 }]);
    expect(unsafe).toHaveBeenCalledTimes(3);
  });

  it("does not retry query errors (e.g. unique violations)", async () => {
    const error = connectionError("23505");
    const { sql, unsafe } = fakeSql(1, error);
    const rows = start(withQueryRetries(sql).unsafe("select 1"));
    await flushRetries();
    await expect(rows).rejects.toBe(error);
    expect(unsafe).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting the retry budget", async () => {
    const error = connectionError("ECONNREFUSED");
    const { sql, unsafe } = fakeSql(99, error);
    const rows = start(withQueryRetries(sql).unsafe("select 1"));
    await flushRetries();
    await expect(rows).rejects.toBe(error);
    expect(unsafe).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it("passes everything except unsafe through to the client", () => {
    const { sql } = fakeSql(0, connectionError("unused"));
    const wrapped = withQueryRetries(sql);
    expect(wrapped.options).toBe(sql.options);
  });
});
