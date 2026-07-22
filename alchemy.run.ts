import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { Redacted } from "effect";
import { unstable_readConfig } from "wrangler";
import { z } from "zod";
import {
  HOSTED_PROD_STAGE,
  readWorkersSubdomain,
  workerName,
} from "./alchemy.access.ts";

// Preview hostnames are `open-seo-<stage>.<WORKERS_SUBDOMAIN>` — the naming
// lives in alchemy.access.ts, shared with the Access wildcard the security
// boundary depends on. The shell copy in .github/workflows/pr-preview.yml
// must be kept in sync by hand.

// Alchemy v2 stack for SaaS deployments — previews and prod. Stage semantics,
// security model, and credentials are documented once in
// docs/PREVIEW_DEPLOYMENTS.md.
//
// - Any stage except "hosted-prod": fresh stage-suffixed resources. Previews
//   deploy via `pnpm deploy:preview --stage <name>`.
// - Stage "hosted-prod": names the EXISTING openseo.so production resources
//   so `--adopt` imports them. Deploy via `pnpm deploy:postgres` (--adopt and
//   the stage baked in).
//
// Self-hosting still deploys through wrangler (wrangler.jsonc); an
// alchemy-based self-host path is a planned fast-follow. Local dev and Docker
// self-host do NOT use this stack (wrangler.jsonc + @cloudflare/vite-plugin).
// This stack deploys the PREBUILT `vite build` output — Alchemy never runs Vite.

// The worker's runtime contract — compatibility date/flags, crons,
// observability, placement, DO/workflow classes — has one source of truth:
// wrangler.jsonc (what local dev and Docker self-host already run). Only
// stage-dependent values (names, domains, env) live in this file.
// unstable_readConfig ships types too loose to lint; validate what we consume.
const wrangler = z
  .object({
    compatibility_date: z.string(),
    compatibility_flags: z.array(z.string()),
    triggers: z.object({ crons: z.array(z.string()) }),
    observability: z
      .object({
        enabled: z.boolean().optional(),
        traces: z.object({ enabled: z.boolean().optional() }).optional(),
      })
      .optional(),
    placement: z.object({ mode: z.enum(["off", "smart"]) }).optional(),
    durable_objects: z.object({
      bindings: z.array(z.object({ name: z.string(), class_name: z.string() })),
    }),
    workflows: z.array(
      z.object({
        binding: z.string(),
        name: z.string(),
        class_name: z.string(),
      }),
    ),
  })
  .parse(unstable_readConfig({ config: "wrangler.jsonc" }));

// Physical names of the wrangler-era production resources (see git history of
// wrangler.jsonc). Adoption matches on these exact names/titles.
const PROD_NAMES = {
  d1: "open-seo",
  r2: "open-seo",
  kv: "every-super-seo",
  oauthKv: "OAUTH_KV",
  hyperdrive: "openseo",
} as const;

const makeResources = (stage: string) => {
  const prod = stage === HOSTED_PROD_STAGE;
  // Prod adopts the LIVE resources; retain makes `alchemy destroy --stage
  // hosted-prod` (or an orphaning refactor) forget state instead of deleting
  // them.
  const keep = Alchemy.RemovalPolicy.retain(prod);
  return {
    DB: Cloudflare.D1.Database("DB", {
      name: prod ? PROD_NAMES.d1 : `open-seo-db-${stage}`,
      // drizzle-generated SQL migrations; tracked in the same
      // wrangler-compatible table prod already uses.
      migrationsDir: "drizzle",
      migrationsTable: "d1_migrations",
    }).pipe(keep),
    R2: Cloudflare.R2.Bucket("R2", {
      name: prod ? PROD_NAMES.r2 : `open-seo-r2-${stage}`,
    }).pipe(keep),
    KV: Cloudflare.KV.Namespace("KV", {
      title: prod ? PROD_NAMES.kv : `open-seo-kv-${stage}`,
    }).pipe(keep),
    OAUTH_KV: Cloudflare.KV.Namespace("OAUTH_KV", {
      title: prod ? PROD_NAMES.oauthKv : `open-seo-oauth-kv-${stage}`,
    }).pipe(keep),
  };
};

/**
 * Prod-only: the existing Hyperdrive config pooling connections to the
 * production Postgres. Origin credentials come from the env file — Cloudflare
 * never returns them, so alchemy must know them to manage the config.
 */
const makeHyperdrive = () =>
  Cloudflare.Hyperdrive.Connection("HYPERDRIVE", {
    name: PROD_NAMES.hyperdrive,
    origin: Config.all([
      Config.string("HYPERDRIVE_ORIGIN_HOST"),
      Config.string("HYPERDRIVE_ORIGIN_PORT").pipe(Config.withDefault("5432")),
      Config.string("HYPERDRIVE_ORIGIN_DATABASE"),
      Config.string("HYPERDRIVE_ORIGIN_USER"),
      Config.redacted("HYPERDRIVE_ORIGIN_PASSWORD"),
    ]).pipe(
      Config.map(([host, port, database, user, password]) => ({
        scheme: "postgres" as const,
        host,
        port: Number(port),
        database,
        user,
        password,
      })),
    ),
    // Prod runs with Hyperdrive caching OFF (no write invalidation for a SaaS
    // with per-user reads-after-writes).
    caching: { disabled: true },
  }).pipe(Alchemy.RemovalPolicy.retain());

const optionalVar = (name: string) =>
  Config.string(name).pipe(
    Config.withDefault(""),
    Config.map((value) => value.trim()),
  );

const optionalSecret = (name: string) =>
  Config.redacted(name).pipe(Config.withDefault(Redacted.make("")));

// Secrets/vars resolve from the env file passed to `alchemy deploy`
// (`Config.redacted` → Cloudflare `secret_text`, `Config.string` → plaintext
// var). NOTE: the alchemy CLI loads `--env-file` into the Config environment,
// NOT into process.env — a process.env read here silently yields "".
const dataEnv = {
  // AUTH_MODE, DATABASE_PROVIDER, BETTER_AUTH_URL, TEAM_DOMAIN, and
  // POLICY_AUD are stage-dependent and set in the stack body below.
  DATAFORSEO_API_KEY: Config.redacted("DATAFORSEO_API_KEY"),
  BYPASS_EMAIL_VERIFICATION: optionalVar("BYPASS_EMAIL_VERIFICATION"),
  BETTER_AUTH_SECRET: optionalSecret("BETTER_AUTH_SECRET"),
  GOOGLE_CLIENT_ID: optionalVar("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optionalSecret("GOOGLE_CLIENT_SECRET"),
  OPENROUTER_API_KEY: optionalSecret("OPENROUTER_API_KEY"),
  OPENROUTER_MODEL: optionalVar("OPENROUTER_MODEL"),
  AUTUMN_SECRET_KEY: optionalSecret("AUTUMN_SECRET_KEY"),
  AUTUMN_WEBHOOK_SECRET: optionalSecret("AUTUMN_WEBHOOK_SECRET"),
  LOOPS_API_KEY: optionalSecret("LOOPS_API_KEY"),
  LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID: optionalVar(
    "LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID",
  ),
  LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID: optionalVar(
    "LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID",
  ),
  POSTHOG_PUBLIC_KEY: optionalVar("POSTHOG_PUBLIC_KEY"),
  POSTHOG_HOST: optionalVar("POSTHOG_HOST"),
  REDDIT_PIXEL_ID: optionalSecret("REDDIT_PIXEL_ID"),
  REDDIT_CONVERSIONS_ACCESS_TOKEN: optionalSecret(
    "REDDIT_CONVERSIONS_ACCESS_TOKEN",
  ),
  TURNSTILE_SECRET_KEY: optionalSecret("TURNSTILE_SECRET_KEY"),
  TURNSTILE_SITE_KEY: optionalVar("TURNSTILE_SITE_KEY"),
};

export default Alchemy.Stack(
  "open-seo",
  {
    providers: Cloudflare.providers(),
    // Durable state in the Cloudflare state store (an `alchemy-state-store`
    // Worker on this account; one-time `pnpm alchemy cloudflare bootstrap`).
    // CI fetches its auth token from the account Secrets Store each run.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const prod = stage === HOSTED_PROD_STAGE;
    // Fail closed: an unset AUTH_MODE gets the Access-gated mode (matching the
    // app's own default in src/lib/auth-mode.ts), never public hosted signup.
    // hosted/local_noauth must be set explicitly.
    const authMode = yield* Config.string("AUTH_MODE").pipe(
      Config.withDefault("cloudflare_access"),
    );
    const databaseProvider = yield* optionalVar("DATABASE_PROVIDER");
    const workersSubdomain = yield* readWorkersSubdomain({ required: false });

    // Auth needs an absolute BETTER_AUTH_URL. Prod sets it explicitly;
    // previews always derive it from the deterministic worker name — a wrong
    // WORKERS_SUBDOMAIN surfaces in CI's post-deploy Access verify step.
    let authUrl: string;
    if (prod) {
      authUrl = yield* optionalVar("BETTER_AUTH_URL");
      if (!authUrl) {
        return yield* Effect.die(
          new Error(
            "Set BETTER_AUTH_URL (https://app.openseo.so) in .env.production.",
          ),
        );
      }
      // Prod must say which database it runs on. A silently-defaulted "d1"
      // would deploy cleanly against the stale pre-Postgres data.
      if (databaseProvider !== "postgres" && databaseProvider !== "d1") {
        return yield* Effect.die(
          new Error(
            "Set DATABASE_PROVIDER explicitly in .env.production (prod runs postgres).",
          ),
        );
      }
    } else if (workersSubdomain) {
      authUrl = `https://${workerName(stage)}.${workersSubdomain}`;
    } else if (authMode === "hosted") {
      return yield* Effect.die(
        new Error(
          "Hosted previews derive BETTER_AUTH_URL from WORKERS_SUBDOMAIN — set it to the account's full workers.dev subdomain (shown under Workers & Pages).",
        ),
      );
    } else {
      // local_noauth / cloudflare_access never read BETTER_AUTH_URL —
      // src/lib/auth.ts uses a placeholder baseURL off the hosted path.
      authUrl = "";
    }

    // cloudflare_access self-host reads these; hosted/local_noauth leave them
    // empty. (Deriving/provisioning the Access application is a follow-up PR.)
    const teamDomain = yield* optionalVar("TEAM_DOMAIN");
    const policyAud = yield* optionalVar("POLICY_AUD");

    const app = yield* Cloudflare.Worker("open-seo", {
      name: workerName(stage),
      // Prod serves the real domains; the zone is inferred from the hostname.
      domain: prod ? ["app.openseo.so", "www.app.openseo.so"] : undefined,
      // Prebuilt worker from `vite build` (@cloudflare/vite-plugin). The entry
      // exports the DO + WorkflowEntrypoint classes (re-exported by
      // src/server.ts), which `bundle: false` requires. Sibling chunks under
      // assets/ are uploaded as-is by the default module rules.
      main: "./dist/server/index.js",
      bundle: false,
      assets: {
        directory: "./dist/client",
      },
      compatibility: {
        date: wrangler.compatibility_date,
        flags: wrangler.compatibility_flags,
      },
      // Site audits parse and persist batches of HTML inside Workflow steps.
      // Paid Workers permit up to five minutes; keep headroom for unusually
      // link-heavy sites after bounding page bodies and bulk-writing links.
      limits: { cpuMs: 300_000 },
      observability: {
        enabled: wrangler.observability?.enabled ?? true,
        traces: { enabled: wrangler.observability?.traces?.enabled ?? false },
      },
      placement:
        wrangler.placement?.mode === "smart" ? { mode: "smart" } : undefined,
      // Scheduled rank checks — src/server.ts `scheduled` handler.
      crons: wrangler.triggers.crons,
      env: {
        ...makeResources(stage),
        ...dataEnv,
        AUTH_MODE: authMode,
        DATABASE_PROVIDER: databaseProvider || "d1",
        BETTER_AUTH_URL: authUrl,
        TEAM_DOMAIN: teamDomain,
        POLICY_AUD: policyAud,

        // Prod-only: pooled Postgres via the existing Hyperdrive config.
        ...(prod ? { HYPERDRIVE: makeHyperdrive() } : {}),

        // Durable Objects (Agents SDK chat agents). Alchemy backs new DO
        // classes with SQLite storage, which both require.
        ...Object.fromEntries(
          wrangler.durable_objects.bindings.map((binding) => [
            binding.name,
            Cloudflare.DurableObject(binding.name, {
              className: binding.class_name,
            }),
          ]),
        ),

        // Cloudflare Workflows (upstream props-only form for prebuilt
        // workers). Workflow names are ACCOUNT-scoped: prod owns the
        // unsuffixed names; previews carry the stage suffix so concurrent
        // stages can't repoint each other's workflows (registration is a
        // PUT-as-upsert on the name).
        ...Object.fromEntries(
          wrangler.workflows.map((workflow) => [
            workflow.binding,
            Cloudflare.Workflow(
              prod ? workflow.name : `${workflow.name}-${stage}`,
              { className: workflow.class_name },
            ),
          ]),
        ),
      },
    }).pipe(
      // Prod adopts the live worker serving app.openseo.so; never delete it
      // on destroy. (Workflow registrations aren't individually retainable —
      // they're created inside the worker provider — but re-registering them
      // is a lossless upsert, unlike deleting the data-bearing resources.)
      Alchemy.RemovalPolicy.retain(prod),
    );

    return { url: app.url.as<string>() };
  }),
);
