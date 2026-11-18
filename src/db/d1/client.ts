import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

let binding: D1Database | undefined;
let database: ReturnType<typeof createDatabase> | undefined;

// celld installs bindings when an invocation starts, after evaluating the
// module. Never capture env.DB while the bundle is being initialized.
function getDatabase() {
  if (!env.DB) throw new Error("The D1 binding DB is unavailable");
  if (!database || binding !== env.DB) {
    binding = env.DB;
    database = createDatabase(binding);
  }
  return database;
}

// Match the lazy database handle already used by the Postgres adapter.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the proxy delegates every access to the typed Drizzle instance
export const d1Db = new Proxy({} as ReturnType<typeof createDatabase>, {
  get(_target, property) {
    const value: unknown = Reflect.get(getDatabase(), property);
    return value;
  },
});
