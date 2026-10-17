/**
 * OpenSEO on an Every App gateway (AUTH_MODE=everyapp). The gateway signs
 * people in and decides who may open OpenSEO, serves its MCP tools on the
 * gateway's one connector, and holds the DataForSEO, Context and OpenRouter
 * keys, so a deploy needs no OpenSEO settings at all. See
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
  migrations: { engine: "drizzle", dir: "drizzle/sqlite", binding: "DB" },
  // SAM, prompt suggestions and website research, through the gateway's AI
  // proxy and its OPENROUTER_API_KEY.
  providers: ["openrouter"],
  // What OpenSEO calls through the gateway with keys only the gateway holds
  // (integrationFetch). An approval covers the app; the gateway attributes
  // each call to the organization in the request's identity, or, from
  // Workflows and SAM, in `x-everyapp-org` (src/server/lib/
  // gateway-attribution.ts).
  capabilities: {
    dataforseo: {
      access: "read",
      why: "Keyword, SERP, backlink, local business and AI answer data, including scheduled rank checks.",
    },
    context: {
      access: "read",
      why: "Renders JavaScript-heavy pages when a site audit asks for it.",
    },
  },
  // Both Workers, from cloudflare.config.ts and vite-plugin-every-app.ts.
  build: "AUTH_MODE=everyapp pnpm exec vite build",
  dev: "AUTH_MODE=everyapp pnpm exec vite dev --host 127.0.0.1",
  // Nothing reaches OpenSEO without a signed-in member: report sharing and
  // the other unauthenticated routes are hosted-only, and the gateway's tool
  // calls (`/__everyapp/tools/*`) carry their own gateway-signed tokens.
  public: [],
} as const;
