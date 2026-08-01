import { getDatabaseProvider } from "./provider";
import { d1Db } from "./d1/client";
import { pgDb } from "./pg/client";

// Per-request Postgres client scope (no-op in D1 mode). Re-exported here so
// entrypoints import it from "@/db" rather than the dialect-specific client.
export { withPgClient } from "./pg/client";

// Provider-aware database handle. D1 is the default (free, zero-config self-host
// on the Cloudflare free plan); Postgres is opt-in via DATABASE_PROVIDER=postgres.
//
// Typed as the D1 client so repositories get full Drizzle inference (the
// parity test guarantees the Postgres schema is structurally identical). The
// Postgres driver has no `.batch`, so atomic multi-statement writes must go
// through `runBatch` (./runBatch) rather than `db.batch`.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- guarded by schema-parity.test.ts
export const db = (getDatabaseProvider() === "postgres"
  ? pgDb
  : d1Db) as unknown as typeof d1Db;
