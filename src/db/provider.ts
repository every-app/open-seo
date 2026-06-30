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

export function getPostgresConnectionString() {
  const hyperdrive = Reflect.get(env, "HYPERDRIVE") as
    | { connectionString?: string }
    | undefined;
  const hyperdriveUrl = hyperdrive?.connectionString?.trim();
  if (hyperdriveUrl) {
    return hyperdriveUrl;
  }

  const directUrl = Reflect.get(env, "POSTGRES_DATABASE_URL");
  if (typeof directUrl === "string" && directUrl.trim()) {
    return directUrl.trim();
  }

  throw new Error(
    "DATABASE_PROVIDER=postgres requires a HYPERDRIVE binding or POSTGRES_DATABASE_URL.",
  );
}
