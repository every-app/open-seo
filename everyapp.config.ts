/**
 * OpenSEO on an Every App gateway (AUTH_MODE=everyapp). The gateway signs
 * people in and decides who may open OpenSEO, serves its MCP tools on the
 * gateway's one connector, and holds the DataForSEO, Context and OpenRouter
 * keys, so a deploy needs no OpenSEO settings to open (its own two,
 * CRAWLER_ACCESS_SECRET and OPENROUTER_MODEL, are optional, below). See
 * docs/maintainers/every-app.md.
 *
 * This manifest describes the fork shape: D1 and KV, one organization
 * (EVERY_APP_ORG_ID, set by the deploy). The first-party deployment, one
 * Worker for every organization, uses the same manifest but runs on Postgres:
 * it sets DATABASE_PROVIDER=postgres and binds HYPERDRIVE on both Workers
 * outside this file until the CLI provisions Hyperdrive: the Alchemy stage
 * `everyapp` (docs/EVERY_APP_DEPLOYMENT.md).
 *
 *   pnpm dev:everyapp       # local, behind a gateway-lite with a dev user
 *   pnpm deploy:everyapp    # to the gateway `everyapp login` points at
 */
export default {
  id: "openseo",
  name: "OpenSEO",
  description:
    "SEO research, rank tracking, site audits and AI visibility for your sites.",
  icon: "/everyapp-icon.svg",
  // wrangler.jsonc's, so every build of OpenSEO runs on the same runtime.
  compatibilityDate: "2025-09-02",
  resources: {
    d1: ["DB"],
    kv: ["KV"],
    durableObjects: [
      { name: "SAM_CHAT", className: "SamChatAgent" },
      // Each audit's crawl state, private to the audit Worker.
      {
        name: "AUDIT_SCRATCHPAD",
        className: "AuditScratchpad",
        worker: "audit",
      },
    ],
    workflows: [
      { name: "RANK_CHECK_WORKFLOW", className: "RankCheckWorkflow" },
      { name: "AI_VISIBILITY_WORKFLOW", className: "AiVisibilityWorkflow" },
      {
        name: "SITE_AUDIT_WORKFLOW",
        className: "SiteAuditWorkflow",
        worker: "audit",
      },
    ],
  },
  // The site-audit engine (src/audit-worker.ts), on an isolate of its own
  // as the open-seo-audit Worker elsewhere. The app reaches it through
  // AUDIT_ENGINE and SITE_AUDIT_WORKFLOW.
  workers: [{ name: "audit", binding: "AUDIT_ENGINE" }],
  // `config` names the drizzle config the deploy's schema check runs
  // drizzle-kit generate with; there is no drizzle.config.ts at the root
  // (the Postgres and remote-D1 configs sit beside this one).
  migrations: {
    engine: "drizzle",
    dir: "drizzle/sqlite",
    config: "drizzle/sqlite.config.ts",
    binding: "DB",
  },
  // What the gateway must hold before OpenSEO opens (required, the default)
  // or may hold (optional: the feature says what is missing where it is
  // used). `why` is for whoever sets it.
  // Through the gateway's AI proxy and its OPENROUTER_API_KEY.
  providers: [
    {
      id: "openrouter",
      why: "SAM, prompt suggestions and website research run on it.",
    },
  ],
  // What OpenSEO calls through the gateway with keys only the gateway holds
  // (integrationFetch). An approval covers the app; the gateway attributes
  // each call to the organization in the request's identity, or, from
  // Workflows and SAM, in `x-everyapp-org` (src/server/lib/
  // gateway-attribution.ts).
  capabilities: {
    dataforseo: {
      access: "read",
      why: "Keyword, SERP, backlink, local business and AI answer data, including scheduled rank checks. The value is `login:password` from the DataForSEO dashboard, or its base64.",
    },
    // Audits run without it: the "Render JavaScript" option says an admin
    // sets it (src/server/lib/audit/rendering-policy.ts).
    context: {
      access: "read",
      optional: true,
      why: "Renders JavaScript-heavy pages when a site audit asks for it.",
    },
  },
  // OpenSEO's own, on its Workers (`pnpm everyapp secret set <NAME> --app
  // openseo`). Without CRAWLER_ACCESS_SECRET the crawler-access form says so
  // (src/client/features/crawler-access/CrawlerAccessForm.tsx); without
  // OPENROUTER_MODEL the default in src/server/lib/openrouter.ts is used.
  secrets: [
    {
      name: "CRAWLER_ACCESS_SECRET",
      optional: true,
      why: "Encrypts the Shopify crawler-access signatures that audits of protected stores send. Any string of 32+ characters, e.g. `openssl rand -base64 32`.",
    },
    {
      name: "OPENROUTER_MODEL",
      optional: true,
      why: "Picks the OpenRouter model for SAM, prompt suggestions and website research (default openai/gpt-5.6-luna). The key itself is the gateway's OPENROUTER_API_KEY.",
    },
  ],
  // Both Workers, from cloudflare.config.ts and vite-plugin-every-app.ts.
  build: "AUTH_MODE=everyapp pnpm exec vite build",
  dev: "AUTH_MODE=everyapp pnpm exec vite dev --host 127.0.0.1",
  // Nothing reaches OpenSEO without a signed-in member: report sharing and
  // the other unauthenticated routes are hosted-only, and the gateway's tool
  // calls (`/__everyapp/tools/*`) carry their own gateway-signed tokens.
  public: [],
} as const;
