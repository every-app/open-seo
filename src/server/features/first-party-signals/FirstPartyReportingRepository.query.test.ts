import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as ReportingRepositoryModule from "./FirstPartyReportingRepository";
import type * as SignalsRepositoryModule from "./FirstPartySignalsRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let FirstPartyReportingRepository: typeof ReportingRepositoryModule.FirstPartyReportingRepository;
let FirstPartySignalsRepository: typeof SignalsRepositoryModule.FirstPartySignalsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.executeMultiple(`
    CREATE TABLE first_party_signal_sources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL
    );
    CREATE TABLE first_party_signal_batches (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      status TEXT NOT NULL,
      processing_lease_id TEXT,
      completed_at TEXT
    );
    CREATE TABLE first_party_signal_daily_aggregates (
      id TEXT PRIMARY KEY,
      batch_receipt_id TEXT NOT NULL,
      processing_attempt_id TEXT NOT NULL,
      landing_path TEXT NOT NULL,
      search_started INTEGER NOT NULL,
      search_completed INTEGER NOT NULL,
      search_no_results INTEGER NOT NULL,
      registrations_completed INTEGER NOT NULL,
      checkout_started INTEGER NOT NULL,
      payments_completed INTEGER NOT NULL,
      received_at TEXT NOT NULL
    );
  `);

  ({ FirstPartyReportingRepository } =
    await import("./FirstPartyReportingRepository"));
  ({ FirstPartySignalsRepository } =
    await import("./FirstPartySignalsRepository"));
});

afterAll(() => client.close());

async function insertAggregate(input: {
  id: string;
  batchReceiptId: string;
  attemptId: string;
  searches: number;
}) {
  await client.execute({
    sql: `INSERT INTO first_party_signal_daily_aggregates
      (id, batch_receipt_id, processing_attempt_id, landing_path,
       search_started, search_completed, search_no_results,
       registrations_completed, checkout_started, payments_completed,
       received_at)
      VALUES (?, ?, ?, '/pricing', ?, ?, 0, 0, 0, 0, '2026-09-04T12:00:00.000Z')`,
    args: [
      input.id,
      input.batchReceiptId,
      input.attemptId,
      input.searches,
      input.searches,
    ],
  });
}

describe("FirstPartyReportingRepository query boundaries", () => {
  it("reads only the winning attempt owned by the requested project", async () => {
    await client.executeMultiple(`
      INSERT INTO first_party_signal_sources (id, project_id)
        VALUES ('source_a', 'project_a'), ('source_b', 'project_b');
      INSERT INTO first_party_signal_batches
        (id, source_id, snapshot_date, status, processing_lease_id)
        VALUES
          ('batch_a', 'source_a', '2026-09-04', 'complete', 'attempt_winner'),
          ('batch_b', 'source_b', '2026-09-04', 'complete', 'attempt_b');
    `);
    await insertAggregate({
      id: "row_winner",
      batchReceiptId: "batch_a",
      attemptId: "attempt_winner",
      searches: 5,
    });
    await insertAggregate({
      id: "row_stale",
      batchReceiptId: "batch_a",
      attemptId: "attempt_expired",
      searches: 999,
    });
    await insertAggregate({
      id: "row_other_project",
      batchReceiptId: "batch_b",
      attemptId: "attempt_b",
      searches: 777,
    });

    const funnel = await FirstPartyReportingRepository.getFunnel(
      "project_a",
      "2026-09-01",
      "2026-09-30",
    );
    const landings = await FirstPartyReportingRepository.getLandingConversions(
      "project_a",
      "2026-09-01",
      "2026-09-30",
      10,
    );

    expect(Number(funnel?.searchStarted)).toBe(5);
    expect(landings).toHaveLength(1);
    expect(Number(landings[0]?.searchStarted)).toBe(5);
  });

  it("publishes a receipt only for its current processing attempt", async () => {
    await client.executeMultiple(`
      INSERT INTO first_party_signal_batches
        (id, source_id, snapshot_date, status, processing_lease_id)
        VALUES ('batch_c', 'source_a', '2026-09-05', 'pending', 'attempt_current');
    `);

    await expect(
      FirstPartySignalsRepository.completeBatch({
        batchReceiptId: "batch_c",
        leaseId: "attempt_expired",
        now: "2026-09-05T12:00:00.000Z",
      }),
    ).resolves.toBe(false);
    await expect(
      FirstPartySignalsRepository.completeBatch({
        batchReceiptId: "batch_c",
        leaseId: "attempt_current",
        now: "2026-09-05T12:00:01.000Z",
      }),
    ).resolves.toBe(true);
  });
});
