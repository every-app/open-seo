import { env } from "cloudflare:workers";

type DatabaseProvider = "d1" | "postgres";

// process.env first (where `.env.local` and Docker's
// CLOUDFLARE_INCLUDE_PROCESS_ENV land), then the Workers env; empty strings
// count as unset. Kept local rather than importing runtime-env so the DB layer
// stays a leaf module that tests can mock around.
function readEnv(name: string): string | undefined {
  const processValue =
    typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (processValue) return processValue;
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function getDatabaseProvider(): DatabaseProvider {
  const provider = readEnv("DATABASE_PROVIDER");

  if (provider === "postgres") {
    return "postgres";
  }

  if (provider === "d1" || provider === undefined) {
    return "d1";
  }

  throw new Error(
    `Unsupported DATABASE_PROVIDER "${String(provider)}". Expected "d1" or "postgres".`,
  );
}

type PostgresConnection = {
  connectionString: string;
  // Hyperdrive pools origin connections at the edge; a direct URL relies on
  // the database's own pooler (e.g. Supabase's Supavisor), which changes how
  // the client must behave (see src/db/pg/client.ts).
  viaHyperdrive: boolean;
};

// Postgres connection resolution, in order:
//   1. HYPERDRIVE binding — Cloudflare deploys that front Postgres with
//      Hyperdrive (alchemy.run.ts provisions it from HYPERDRIVE_ORIGIN_*). In
//      local dev the binding resolves to wrangler.jsonc's localConnectionString.
//   2. DATABASE_URL — a direct connection string, e.g. a Supabase pooler URL.
//      This is the path for local dev against Supabase and for any runtime
//      that has no Hyperdrive binding.
export function getPostgresConnection(): PostgresConnection {
  const hyperdrive = Reflect.get(env, "HYPERDRIVE") as
    | { connectionString?: string }
    | undefined;
  const hyperdriveUrl = hyperdrive?.connectionString?.trim();
  if (hyperdriveUrl) {
    return { connectionString: hyperdriveUrl, viaHyperdrive: true };
  }

  const databaseUrl = readEnv("DATABASE_URL")?.trim();
  if (databaseUrl) {
    return { connectionString: databaseUrl, viaHyperdrive: false };
  }

  throw new Error(
    "DATABASE_PROVIDER=postgres requires either a HYPERDRIVE binding or DATABASE_URL (see docs/DATABASE_SUPABASE.md).",
  );
}
