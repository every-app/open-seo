import { env } from "cloudflare:workers";

type DatabaseProvider = "d1" | "postgres";

export function getDatabaseProvider(): DatabaseProvider {
  const provider = Reflect.get(env, "DATABASE_PROVIDER");

  if (provider === "postgres") {
    return "postgres";
  }

  if (provider === "d1" || provider === undefined || provider === "") {
    return "d1";
  }

  throw new Error(
    `Unsupported DATABASE_PROVIDER "${String(provider)}". Expected "d1" or "postgres".`,
  );
}

// Postgres is only reachable through the HYPERDRIVE binding — never a direct
// connection string from a Worker var. In local dev the binding resolves to
// `localConnectionString` from wrangler.jsonc (miniflare never contacts real
// Hyperdrive), so the same code path covers both.
export function getPostgresConnectionString() {
  const hyperdrive = Reflect.get(env, "HYPERDRIVE") as
    | { connectionString?: string }
    | undefined;
  const hyperdriveUrl = hyperdrive?.connectionString?.trim();
  if (hyperdriveUrl) {
    return hyperdriveUrl;
  }

  throw new Error(
    "DATABASE_PROVIDER=postgres requires a HYPERDRIVE binding (in local dev, its localConnectionString).",
  );
}
