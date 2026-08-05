// Custom environment variable type definitions
// These extend the auto-generated Env interface from worker-configuration.d.ts

declare namespace Cloudflare {
  interface Env {
    R2: R2Bucket;
    OAUTH_KV: KVNamespace;

    // Durable Object backing the onboarding strategy chat (see wrangler.jsonc).
    ONBOARDING_CHAT: DurableObjectNamespace;

    // Durable Object backing the SAM in-app agent (see wrangler.jsonc).
    SAM_CHAT: DurableObjectNamespace;

    // Workflow driving the daily PageSpeed sweep (see wrangler.jsonc).
    // Declared here rather than taken from worker-configuration.d.ts: the
    // checked-in generated file predates the installed wrangler, so
    // regenerating it rewrites ~6k lines of unrelated runtime types and breaks
    // two existing call sites. That regen is its own chore, not this feature's
    // — drop this block once it happens.
    //
    // The payload is spelled out because a .d.ts global augmentation cannot
    // carry a top-level import. It is not load-bearing: the cron passes this
    // binding into a parameter typed from the real `PagespeedSweepParams`, so
    // any drift between the two fails typecheck.
    PAGESPEED_SWEEP_WORKFLOW: Workflow<{
      projectId: string;
      urlIds: string[];
    }>;

    AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted";
    BYPASS_EMAIL_VERIFICATION?: string;
    TEAM_DOMAIN?: string;
    POLICY_AUD?: string;
    POSTHOG_PUBLIC_KEY?: string;
    POSTHOG_HOST?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    DATABASE_PROVIDER?: "d1" | "postgres";
    HYPERDRIVE?: {
      connectionString: string;
    };
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    LOOPS_API_KEY?: string;
    LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID?: string;
    LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID?: string;
    AUTUMN_SECRET_KEY?: string;
    AUTUMN_WEBHOOK_SECRET?: string;

    // Cloudflare Turnstile — signup captcha (hosted only). Secret verifies
    // tokens server-side; site key is public and inlined into the client build.
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_SITE_KEY?: string;

    // DataForSEO API Basic auth value (base64 of login:password)
    DATAFORSEO_API_KEY: string;

    // Google API key with the PageSpeed Insights API enabled. Optional: a
    // missing key renders the setup card instead of erroring.
    PAGESPEED_API_KEY?: string;

    // Stripe secret (or restricted read) API key for the Revenue page and the
    // get_stripe_revenue MCP tool. May be organization-level — the target
    // account then lives per-connection in stripe_connections, not here.
    // Optional: missing renders the setup card.
    STRIPE_SECRET_KEY?: string;

    // OpenRouter API key for the in-app chat agents (onboarding + SAM).
    OPENROUTER_API_KEY?: string;
    // Optional OpenRouter model slug override (defaults in openrouter.ts).
    OPENROUTER_MODEL?: string;
  }
}

interface ImportMetaEnv {
  readonly AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted";
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
