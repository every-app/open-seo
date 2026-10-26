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
  resolveSelfHostAccess,
  resolveWorkersSubdomain,
  workerName,
} from "./alchemy.access.ts";
import {
  EVERYAPP_STAGE,
  makeEveryAppHyperdrive,
  readEveryAppStage,
} from "./alchemy.everyapp.ts";

// Preview hostnames are `open-seo-<stage>.<WORKERS_SUBDOMAIN>` — the naming
// lives in alchemy.access.ts, shared with the Access wildcard the security
// boundary depends on. The shell copy in .github/workflows/pr-preview.yml
// must be kept in sync by hand.

// Alchemy v2 stack for SaaS deployments — previews, prod, and Cloudflare
// self-hosting. Stage semantics, security model, and credentials are
// documented once in docs/maintainers/preview-deployments.md.
//
// - Any stage except "hosted-prod": fresh stage-suffixed resources. Previews
//   deploy via `pnpm deploy:preview --stage <name>`; self-hosters via
//   `pnpm deploy:selfhost` (stage "selfhost", no flag to pass).
// - Stage "hosted-prod": names the EXISTING openseo.so production resources
//   so `--adopt` imports them. Deployed only by the manual GitHub workflow
//   (.github/workflows/deploy-production.yml), which supplies secrets from
//   the GitHub `production` environment.
// - Stage "everyapp": the first-party OpenSEO behind the hosted Every App
//   gateway, on Postgres through Hyperdrive (alchemy.everyapp.ts,
//   docs/EVERY_APP_DEPLOYMENT.md). Deploy via `pnpm deploy:everyapp:first-party`.
//
// Local dev and Docker self-host do NOT use this stack (wrangler.jsonc +
// @cloudflare/vite-plugin). This stack deploys the PREBUILT `vite build`
// output — Alchemy never runs Vite.

// The worker's runtime contract — compatibility date/flags, crons,
// observability, placement, DO/workflow classes — has one source of truth:
// wrangler.jsonc (what local dev and Docker self-host already run). Only
// stage-dependent values (names, domains, env, and prod's placement override)
// live in this file.
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
        // Set when the workflow class lives in the open-seo-audit aux
        // worker; alchemy substitutes the stage-suffixed worker name below.
        script_name: z.string().optional(),
      }),
    ),
  })
  .parse(unstable_readConfig({ config: "wrangler.jsonc" }));

const observability = {
  enabled: wrangler.observability?.enabled ?? true,
  traces: { enabled: wrangler.observability?.traces?.enabled ?? false },
};
// Other stages run on D1 and keep wrangler.jsonc's Smart Placement; prod
// overrides it below.
const defaultPlacement =
  wrangler.placement?.mode === "smart" ? { mode: "smart" as const } : undefined;

// Physical names of the wrangler-era production resources (see git history of
// wrangler.jsonc). Adoption matches on these exact names/titles.
const PROD_NAMES = {
  d1: "open-seo",
  r2: "open-seo",
  kv: "every-super-seo",
  oauthKv: "OAUTH_KV",
} as const;

const makeResources = (stage: string, usesD1: boolean) => {
  const prod = stage === HOSTED_PROD_STAGE;
  // Prod adopts the LIVE resources; retain makes `alchemy destroy --stage
  // hosted-prod` (or an orphaning refactor) forget state instead of deleting
  // them. The everyapp stage holds its customers' data too.
  const keep = Alchemy.RemovalPolicy.retain(prod || stage === EVERYAPP_STAGE);
  return {
    // Postgres deploys never touch D1: no database, binding, or SQLite
    // migrations. Dropping it forgets (never deletes) the retained prod D1.
    ...(usesD1
      ? {
          DB: Cloudflare.D1.Database("DB", {
            name: prod ? PROD_NAMES.d1 : `open-seo-db-${stage}`,
            // drizzle-generated SQL migrations; tracked in the same
            // wrangler-compatible table prod already uses.
            migrationsDir: "drizzle/sqlite",
            migrationsTable: "d1_migrations",
          }).pipe(keep),
        }
      : {}),
    R2: Cloudflare.R2.Bucket("R2", {
      name: prod ? PROD_NAMES.r2 : `open-seo-r2-${stage}`,
      // Expire cached DataForSEO responses. Prod's lifecycle rules are
      // dashboard-managed; its props stay omitted so alchemy leaves them be.
      ...(prod
        ? {}
        : {
            lifecycleRules: [
              {
                id: "dataforseo-cache-expiry",
                prefix: "dataforseo-cache/",
                deleteObjectsTransition: {
                  condition: { type: "Age", maxAge: 7 * 24 * 60 * 60 },
                },
              },
            ],
          }),
    }).pipe(keep),
    KV: Cloudflare.KV.Namespace("KV", {
      title: prod ? PROD_NAMES.kv : `open-seo-kv-${stage}`,
    }).pipe(keep),
    OAUTH_KV: Cloudflare.KV.Namespace("OAUTH_KV", {
      title: prod ? PROD_NAMES.oauthKv : `open-seo-oauth-kv-${stage}`,
    }).pipe(keep),
  };
};

// Prod-only: the existing Hyperdrive config bound by ID. A managed
// Hyperdrive.Connection would need the origin password on every deploy, so
// the config (caching OFF, origin connection limit 30) is managed in the
// Cloudflare dashboard instead.
const hyperdriveBinding = (hyperdriveId: string) => ({
  bindings: [
    { type: "hyperdrive" as const, name: "HYPERDRIVE", id: hyperdriveId },
  ],
});

const optionalVar = (name: string) =>
  Config.string(name).pipe(
    Config.withDefault(""),
    Config.map((value) => value.trim()),
  );

const optionalSecret = (name: string) =>
  Config.redacted(name).pipe(Config.withDefault(Redacted.make("")));

/**
 * The absolute BETTER_AUTH_URL each stage runs with. Prod sets it explicitly;
 * previews always derive it from the deterministic worker name — a wrong
 * WORKERS_SUBDOMAIN surfaces in CI's post-deploy Access verify step; the
 * everyapp stage is where the gateway publishes OpenSEO.
 */
const resolveAuthUrl = (
  stage: string,
  authMode: string,
  workersSubdomain: string,
  everyAppUrl: string | undefined,
) =>
  Effect.gen(function* () {
    const prod = stage === HOSTED_PROD_STAGE;
    if (everyAppUrl) return everyAppUrl;
    let authUrl: string;
    if (prod) {
      authUrl = yield* optionalVar("BETTER_AUTH_URL");
      if (!authUrl) {
        return yield* Effect.die(
          new Error(
            "Set BETTER_AUTH_URL (https://app.openseo.so) in the production workflow.",
          ),
        );
      }
    } else if (workersSubdomain) {
      authUrl = `https://${workerName(stage)}.${workersSubdomain}`;
    } else if (authMode === "password") {
      // Password accounts need the real public URL (session cookies, the
      // OAuth callbacks MCP clients use). The self-host env file sets no
      // WORKERS_SUBDOMAIN, so read it from the account.
      const subdomain = yield* resolveWorkersSubdomain(workersSubdomain, "");
      authUrl = `https://${workerName(stage)}.${subdomain}`;
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

    return authUrl;
  });

// Secrets/vars resolve from Config (`Config.redacted` → Cloudflare
// `secret_text`, `Config.string` → plaintext var). Previews and self-host pass
// an `--env-file`, which the alchemy CLI loads into Config, NOT process.env;
// the production workflow exports them as job/step env instead.
const dataEnv = {
  // AUTH_MODE, DATABASE_PROVIDER, BETTER_AUTH_URL, TEAM_DOMAIN, POLICY_AUD,
  // and OPENSEO_OPERATOR_SECRET are stage-dependent and set in the stack body
  // below, which also replaces an unset BETTER_AUTH_SECRET in password mode.
  DATAFORSEO_API_KEY: Config.redacted("DATAFORSEO_API_KEY"),
  BYPASS_EMAIL_VERIFICATION: optionalVar("BYPASS_EMAIL_VERIFICATION"),
  BETTER_AUTH_SECRET: optionalSecret("BETTER_AUTH_SECRET"),
  CRAWLER_ACCESS_SECRET: optionalSecret("CRAWLER_ACCESS_SECRET"),
  WEB_BOT_AUTH_JWK: optionalSecret("WEB_BOT_AUTH_JWK"),
  GOOGLE_CLIENT_ID: optionalVar("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optionalSecret("GOOGLE_CLIENT_SECRET"),
  GOOGLE_MAPS_API_KEY: optionalSecret("GOOGLE_MAPS_API_KEY"),
  OPENROUTER_API_KEY: optionalSecret("OPENROUTER_API_KEY"),
  OPENROUTER_MODEL: optionalVar("OPENROUTER_MODEL"),
  CONTEXT_API_KEY: optionalSecret("CONTEXT_API_KEY"),
  AUTUMN_SECRET_KEY: optionalSecret("AUTUMN_SECRET_KEY"),
  AUTUMN_WEBHOOK_SECRET: optionalSecret("AUTUMN_WEBHOOK_SECRET"),
  DUB_API_KEY: optionalSecret("DUB_API_KEY"),
  META_PIXEL_ID: optionalVar("META_PIXEL_ID"),
  META_CONVERSIONS_API_TOKEN: optionalSecret("META_CONVERSIONS_API_TOKEN"),
  GDPR_ERASURE_SECRET: optionalSecret("GDPR_ERASURE_SECRET"),
  LOOPS_API_KEY: optionalSecret("LOOPS_API_KEY"),
  LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID: optionalVar(
    "LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID",
  ),
  LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID: optionalVar(
    "LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID",
  ),
  LOOPS_TRANSACTIONAL_INVITATION_ID: optionalVar(
    "LOOPS_TRANSACTIONAL_INVITATION_ID",
  ),
  LOOPS_PRODUCT_UPDATES_LIST_ID: optionalVar("LOOPS_PRODUCT_UPDATES_LIST_ID"),
  POSTHOG_PUBLIC_KEY: optionalVar("POSTHOG_PUBLIC_KEY"),
  POSTHOG_HOST: optionalVar("POSTHOG_HOST"),
  TURNSTILE_SECRET_KEY: optionalSecret("TURNSTILE_SECRET_KEY"),
  TURNSTILE_SITE_KEY: optionalVar("TURNSTILE_SITE_KEY"),
  // Alchemy reconciles worker vars and secrets on every deploy, so every value
  // must come from the env file / GitHub environment — a dashboard-set one
  // would be wiped.
  OPENSEO_TELEMETRY_DISABLED: optionalVar("OPENSEO_TELEMETRY_DISABLED"),
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
    // New self-host deployments get AUTH_MODE=password from deploy/.env.selfhost.example;
    // hosted/local_noauth must be set explicitly.
    const authMode = yield* Config.string("AUTH_MODE").pipe(
      Config.withDefault("cloudflare_access"),
    );
    // Undefined on every stage but everyapp, which is Postgres by definition.
    const everyApp = yield* readEveryAppStage(stage, authMode);
    const databaseProvider = everyApp
      ? "postgres"
      : yield* optionalVar("DATABASE_PROVIDER");
    const hyperdriveId = prod ? yield* Config.string("HYPERDRIVE_ID") : "";
    if (prod && (authMode !== "hosted" || databaseProvider !== "postgres")) {
      return yield* Effect.die(
        new Error(
          "hosted-prod requires AUTH_MODE=hosted and DATABASE_PROVIDER=postgres.",
        ),
      );
    }
    const workersSubdomain = yield* readWorkersSubdomain({ required: false });

    const authUrl = yield* resolveAuthUrl(
      stage,
      authMode,
      workersSubdomain,
      everyApp?.appUrl,
    );

    const access = yield* resolveSelfHostAccess(
      stage,
      authMode === "cloudflare_access" && !prod,
      workersSubdomain,
    );

    // Password accounts need a session secret. The self-host env file sets
    // none: the deploy mints one and keeps it in alchemy state, so redeploys
    // keep every session valid. An explicit BETTER_AUTH_SECRET always wins.
    const configuredAuthSecret = yield* dataEnv.BETTER_AUTH_SECRET;
    const betterAuthSecret =
      authMode === "password" && !Redacted.value(configuredAuthSecret)
        ? yield* Alchemy.makeRandom("BetterAuthSecret")
        : configuredAuthSecret;
    // Operator account commands (`pnpm selfhost:admin`: password resets,
    // accounts outside the invitation flow) stay off until the self-hoster
    // sets a secret for them.
    const operatorSecret = yield* optionalSecret("OPENSEO_OPERATOR_SECRET");

    // Self-host deploys may run on the free Workers plan, which rejects the
    // paid-plan CPU limits below.
    const selfHostPlan =
      authMode === "cloudflare_access" || authMode === "password";
    const cpuLimits = selfHostPlan ? {} : { limits: { cpuMs: 300_000 } };
    // Prod adopts the live worker serving app.openseo.so; never delete it on
    // destroy, nor the everyapp stage's.
    const retainWorkers = Alchemy.RemovalPolicy.retain(prod || !!everyApp);

    // Created once and bound into BOTH workers — they share the same
    // D1/KV/R2 (and the everyapp stage's Hyperdrive; prod binds its own by
    // ID below). OAUTH_KV stays app-worker-only. The everyapp stage binds
    // neither D1 (it runs on Postgres) nor OAUTH_KV (the gateway serves MCP).
    const resources = makeResources(stage, databaseProvider !== "postgres");
    const hyperdrive = everyApp
      ? makeEveryAppHyperdrive(workerName(stage))
      : undefined;

    // Aux worker: the site-audit engine (src/audit-worker.ts) — the
    // SiteAuditWorkflow orchestrator and the per-audit AuditScratchpad DO.
    // Its memory spikes (multi-MB Lighthouse payloads, in-flight HTML
    // batches) OOMed the app worker's near-limit baseline heap. Deployed
    // BEFORE the app worker so the app's cross-script workflow/DO bindings
    // always have a target. Takes no direct traffic (url off).
    const auditWorker = yield* Cloudflare.Worker("open-seo-audit", {
      // The everyapp stage's is the name the gateway's registry gives it.
      name: everyApp?.auditWorker.name ?? `${workerName(stage)}-audit`,
      main: "./dist/open_seo_audit/index.js",
      bundle: false,
      url: false,
      compatibility: {
        date: wrangler.compatibility_date,
        flags: wrangler.compatibility_flags,
      },
      // Audit workflow steps parse and persist batches of HTML — the same
      // CPU allowance the app worker used to carry for them. Configurable
      // CPU limits are a paid-plan feature (see selfHostPlan).
      ...cpuLimits,
      observability,
      env: {
        KV: resources.KV,
        R2: resources.R2,
        // Deliberately NOT ...dataEnv: this worker crawls and parses
        // attacker-influenced HTML, so it gets only the secrets its code
        // path reads — DataForSEO (Lighthouse), Autumn (metering), PostHog
        // (capture), CRAWLER_ACCESS_SECRET (Shopify signatures),
        // WEB_BOT_AUTH_JWK (request signing). No auth/OAuth/Loops/Turnstile
        // secrets. Behind the Every App gateway it calls DataForSEO and
        // Context through the gateway instead.
        ...(everyApp
          ? everyApp.auditEnv
          : {
              ...(resources.DB ? { DB: resources.DB } : {}),
              CRAWLER_ACCESS_SECRET: dataEnv.CRAWLER_ACCESS_SECRET,
              WEB_BOT_AUTH_JWK: dataEnv.WEB_BOT_AUTH_JWK,
              CONTEXT_API_KEY: dataEnv.CONTEXT_API_KEY,
              DATAFORSEO_API_KEY: dataEnv.DATAFORSEO_API_KEY,
              AUTUMN_SECRET_KEY: dataEnv.AUTUMN_SECRET_KEY,
              POSTHOG_PUBLIC_KEY: dataEnv.POSTHOG_PUBLIC_KEY,
              POSTHOG_HOST: dataEnv.POSTHOG_HOST,
            }),
        BROWSER: Cloudflare.Browser(),
        AUTH_MODE: authMode,
        DATABASE_PROVIDER: databaseProvider || "d1",
        ...(hyperdrive ? { HYPERDRIVE: hyperdrive } : {}),
        // This worker is the code home of the scratchpad DO and the
        // site-audit workflow; the app worker binds to both cross-script.
        AUDIT_SCRATCHPAD: Cloudflare.DurableObject("AUDIT_SCRATCHPAD", {
          className: "AuditScratchpad",
        }),
        // The name must stay in exact sync with wrangler.jsonc's
        // "site-audit-workflow" entry (and the app env mapping below): the
        // alchemy resource id IS this name, so a drift orphans the live
        // registration and deletes it instead of repointing it.
        SITE_AUDIT_WORKFLOW: Cloudflare.Workflow(
          prod ? "site-audit-workflow" : `site-audit-workflow-${stage}`,
          { className: "SiteAuditWorkflow" },
        ),
      },
    }).pipe(retainWorkers);

    if (prod) {
      yield* auditWorker.bind("hyperdrive", hyperdriveBinding(hyperdriveId));
    }

    const app = yield* Cloudflare.Worker("open-seo", {
      name: workerName(stage),
      // Prod serves the real domains; the zone is inferred from the hostname.
      domain: prod ? ["app.openseo.so", "www.app.openseo.so"] : undefined,
      // The everyapp stage: the registry's name, and no workers.dev URL:
      // only the gateway reaches it.
      ...everyApp?.appWorker,
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
      // Site audits moved to the open-seo-audit worker, but RankCheckWorkflow
      // still parses SERP batches here — keep the CPU allowance until that
      // workflow's per-tick CPU is measured or it moves too. Configurable CPU
      // limits are a paid-plan feature; self-host deploys get the plan
      // default instead (see selfHostPlan).
      ...cpuLimits,
      observability,
      // Hosted prod pins the fetch handler next to its Postgres primary
      // (PlanetScale, AWS us-east-1); each request makes several sequential
      // Hyperdrive round trips. Other stages run on D1 and keep
      // wrangler.jsonc's Smart Placement.
      placement: prod
        ? { mode: "targeted", region: "aws:us-east-1" }
        : defaultPlacement,
      // Scheduled rank checks — src/server.ts `scheduled` handler.
      crons: wrangler.triggers.crons,
      env: {
        KV: resources.KV,
        R2: resources.R2,
        // The everyapp stage: the gateway identity in place of the env file's
        // secrets (alchemy.everyapp.ts).
        ...(everyApp
          ? everyApp.appEnv
          : {
              ...(resources.DB ? { DB: resources.DB } : {}),
              OAUTH_KV: resources.OAUTH_KV,
              ...dataEnv,
              BETTER_AUTH_SECRET: betterAuthSecret,
              TEAM_DOMAIN: access.teamDomain,
              POLICY_AUD: access.policyAud,
            }),
        AUTH_MODE: authMode,
        DATABASE_PROVIDER: databaseProvider || "d1",
        BETTER_AUTH_URL: authUrl,
        ...(authMode === "password" && Redacted.value(operatorSecret)
          ? { OPENSEO_OPERATOR_SECRET: operatorSecret }
          : {}),
        // The audit worker above always binds BROWSER; the app worker checks
        // this before it offers "Render JavaScript".
        AUDIT_BROWSER_RENDERING: "true",

        // The everyapp stage: pooled Postgres via its Hyperdrive config
        // (prod binds its own by ID below).
        ...(hyperdrive ? { HYPERDRIVE: hyperdrive } : {}),

        // Service binding to the audit worker's AuditEngine entrypoint
        // (cancel + GDPR erasure of scratchpad state; env key = binding
        // name).
        AUDIT_ENGINE: auditWorker,

        // Per-user throttle for /mcp API-key auth (see
        // src/server/mcp/api-key-auth.ts). Only this stack declares the
        // binding — the wrangler.jsonc surfaces (local dev, Docker
        // self-host) skip limiting when it's absent.
        MCP_RATE_LIMIT: Cloudflare.RateLimit("MCP_RATE_LIMIT", {
          namespaceId: 1001,
          simple: { limit: 5000, period: 60 },
        }),

        // Per-IP throttle for email sign-in (see src/routes/api/auth/$.ts).
        // Generous enough that no real person or shared office IP hits it.
        AUTH_RATE_LIMIT: Cloudflare.RateLimit("AUTH_RATE_LIMIT", {
          namespaceId: 1002,
          simple: { limit: 20, period: 60 },
        }),

        // Durable Objects (the chat agents; the audit scratchpad lives
        // privately in the open-seo-audit worker). Alchemy backs new DO
        // classes with SQLite storage; wrangler.jsonc's `migrations` only
        // apply to the wrangler/workerd surfaces.
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
        // PUT-as-upsert on the name). Entries carrying a script_name bind
        // cross-script to the audit worker's workflow instead of
        // registering a class of this worker.
        ...Object.fromEntries(
          wrangler.workflows.map((workflow) => [
            workflow.binding,
            Cloudflare.Workflow(
              prod ? workflow.name : `${workflow.name}-${stage}`,
              {
                className: workflow.class_name,
                scriptName: workflow.script_name
                  ? auditWorker.workerName
                  : undefined,
              },
            ),
          ]),
        ),
      },
    }).pipe(
      // (Workflow registrations aren't individually retainable — they're
      // created inside the worker provider — but re-registering them is a
      // lossless upsert, unlike deleting the data-bearing resources.)
      retainWorkers,
    );

    if (prod) {
      yield* app.bind("hyperdrive", hyperdriveBinding(hyperdriveId));
    }

    return { url: app.url.as<string>() };
  }),
);
