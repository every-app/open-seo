// Custom environment variable type definitions
// These extend the auto-generated Env interface from worker-configuration.d.ts

declare namespace Cloudflare {
  interface Env {
    R2: R2Bucket;
    OAUTH_KV: KVNamespace;

    // Durable Object backing the onboarding strategy chat (see wrangler.jsonc).
    ONBOARDING_CHAT: DurableObjectNamespace;

    AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted";
    BYPASS_EMAIL_VERIFICATION?: string;
    TEAM_DOMAIN?: string;
    POLICY_AUD?: string;
    POSTHOG_PUBLIC_KEY?: string;
    POSTHOG_HOST?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    LOOPS_API_KEY?: string;
    LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID?: string;
    LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID?: string;
    AUTUMN_SECRET_KEY?: string;
    AUTUMN_WEBHOOK_SECRET?: string;

    // DataForSEO API Basic auth value (base64 of login:password)
    DATAFORSEO_API_KEY: string;

    // OpenRouter API key for the onboarding chat.
    OPENROUTER_API_KEY?: string;
    // Optional OpenRouter model slug override (defaults in openrouter.ts).
    OPENROUTER_MODEL?: string;
  }
}

interface ImportMetaEnv {
  readonly AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted";
  readonly BYPASS_EMAIL_VERIFICATION?: string;
  readonly POSTHOG_PUBLIC_KEY?: string;
  readonly POSTHOG_HOST?: string;
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
