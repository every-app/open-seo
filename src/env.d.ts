// Custom environment variable type definitions
// These extend the auto-generated Env interface from worker-configuration.d.ts

declare namespace Cloudflare {
  interface Env {
    R2: R2Bucket;
    // Browser Run binding for site-audit JavaScript rendering, audit worker
    // only. Inline import preserves the ambient Env augmentation.
    // oxlint-disable-next-line typescript-eslint/consistent-type-imports
    BROWSER?: import("@cloudflare/workers-types").BrowserRun;
    // Context.dev key: the rendering fallback when Browser Run fails or is
    // blocked, and the only renderer on Docker.
    CONTEXT_API_KEY?: string;
    OAUTH_KV: KVNamespace;

    // Durable Object backing the SAM in-app agent (see wrangler.jsonc).
    SAM_CHAT: DurableObjectNamespace;

    // Durable Object holding per-audit crawl scratch state (frontier, link
    // edges, page mirror). Bound ONLY in the open-seo-audit aux worker;
    // untyped here — getAuditScratchpad narrows the stub.
    AUDIT_SCRATCHPAD: DurableObjectNamespace;

    // Service binding to the audit worker's AuditEngine entrypoint (cancel +
    // GDPR erasure of scratchpad state). The inline import() is required: a
    // top-level import would turn this ambient file into a module and break
    // the global augmentation.
    // oxlint-disable-next-line typescript-eslint/consistent-type-imports
    AUDIT_ENGINE: Service<typeof import("./audit-worker").default>;

    AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted" | "everyapp";
    BYPASS_EMAIL_VERIFICATION?: string;

    // AUTH_MODE=everyapp: OpenSEO behind an Every App gateway. The deploy
    // (`everyapp app deploy`) sets the identity keys, the app id the tokens
    // must name, and the binding through which the gateway calls DataForSEO
    // and OpenRouter with keys only it holds. `everyapp dev` sets the dev
    // keys; EVERYAPP_DEV accepts them, in local dev only.
    EVERYAPP_APP_ID?: string;
    EVERYAPP_IDENTITY_PUBLIC_KEYS?: string;
    EVERYAPP_IDENTITY_ISSUER?: string;
    EVERYAPP_DEV?: string;
    EVERY_APP_GATEWAY?: Fetcher;
    // Set: a fork pinned to that organization. Unset: first party, the
    // organization comes from each request's identity.
    EVERY_APP_ORG_ID?: string;
    GATEWAY_URL?: string;
    // AUTH_MODE=everyapp only (server/lib/deployment-tier.ts): first_party or
    // fork, derived from EVERY_APP_ORG_ID when unset.
    DEPLOYMENT_TIER?: string;
    // "off" holds a first-party deployment's scheduled rank checks and AI
    // visibility runs; they run otherwise.
    FIRST_PARTY_SCHEDULED_CHECKS?: string;
    // "1" on a first-party deployment's Workers: one Worker serves every
    // organization, so the SDK refuses a gateway call that says nobody's
    // (server/lib/gateway-attribution.ts).
    EVERYAPP_SHARED?: string;
    // The Worker's name, which the gateway mints every identity for (`aud`).
    EVERYAPP_AUDIENCE?: string;
    TEAM_DOMAIN?: string;
    POLICY_AUD?: string;
    POSTHOG_PUBLIC_KEY?: string;
    POSTHOG_HOST?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    // Encrypts saved Shopify crawler signatures. Kept separate from
    // BETTER_AUTH_SECRET so the audit worker never holds the auth secret.
    CRAWLER_ACCESS_SECRET?: string;
    DATABASE_PROVIDER?: "d1" | "postgres";
    HYPERDRIVE?: {
      connectionString: string;
    };
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    LOOPS_API_KEY?: string;
    LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID?: string;
    LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID?: string;
    LOOPS_TRANSACTIONAL_INVITATION_ID?: string;
    // Loops mailing list for product-update emails (hosted only). Unset skips
    // the list sync with a warning.
    LOOPS_PRODUCT_UPDATES_LIST_ID?: string;
    AUTUMN_SECRET_KEY?: string;
    AUTUMN_WEBHOOK_SECRET?: string;
    // Dub referral conversion tracking (hosted only); all Dub code no-ops
    // when unset.
    DUB_API_KEY?: string;
    // Meta ad signup attribution via the Conversions API (hosted only); no-ops
    // unless both are set.
    META_PIXEL_ID?: string;
    META_CONVERSIONS_API_TOKEN?: string;
    // HMAC secret for the operator-only GDPR storage-erasure endpoint.
    GDPR_ERASURE_SECRET?: string;

    // Cloudflare Turnstile — signup captcha (hosted only). Secret verifies
    // tokens server-side; site key is public and inlined into the client build.
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_SITE_KEY?: string;

    // DataForSEO API Basic auth value (base64 of login:password)
    DATAFORSEO_API_KEY: string;
    AI_VISIBILITY_WORKFLOW: Workflow<
      (
        | { runId: string }
        | { setupProjectId: string; runSeededTracking?: boolean }
      ) & {
        customer: {
          organizationId: string;
          userId: string;
          userEmail: string;
          projectId?: string;
        };
      }
    >;

    // OpenRouter API key for the SAM in-app chat agent.
    OPENROUTER_API_KEY?: string;
    // Optional OpenRouter model slug override (defaults in openrouter.ts).
    OPENROUTER_MODEL?: string;
  }
}

interface ImportMetaEnv {
  readonly AUTH_MODE?:
    | "cloudflare_access"
    | "local_noauth"
    | "hosted"
    | "everyapp";
  readonly DATABASE_PROVIDER?: "d1" | "postgres";
  readonly BYPASS_EMAIL_VERIFICATION?: string;
  readonly POSTHOG_PUBLIC_KEY?: string;
  readonly POSTHOG_HOST?: string;
  readonly TURNSTILE_SITE_KEY?: string;
  readonly VITE_E2E_DOMAIN_FIXTURES?: string;
  readonly VITE_E2E_KEYWORD_FIXTURES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
