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

    // AI provider keys for the in-app agents (onboarding uses OpenRouter;
    // SAM can use any configured provider). Keys are server-side deployment
    // secrets — never stored in the app DB, never returned to the client.
    OPENROUTER_API_KEY?: string;
    OPENAI_API_KEY?: string;
    GEMINI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    OLLAMA_API_KEY?: string;
    OPENAI_COMPATIBLE_API_KEY?: string;
    // Optional per-provider model defaults (defaults live in providers.ts).
    OPENROUTER_MODEL?: string;
    OPENAI_MODEL?: string;
    GEMINI_MODEL?: string;
    ANTHROPIC_MODEL?: string;
    OLLAMA_CLOUD_MODEL?: string;
    OPENAI_COMPATIBLE_MODEL?: string;
    // OpenAI-Compatible / Ollama Cloud endpoints. Base URLs are deployment
    // configuration (never user secrets); hosted builds only allow public
    // HTTPS targets, self-hosted may point at local gateways.
    OPENAI_COMPATIBLE_BASE_URL?: string;
    OLLAMA_CLOUD_BASE_URL?: string;
    // UI-entered AI credentials are encrypted at rest with this key (or
    // derived from BETTER_AUTH_SECRET when unset). Deployment-only secret —
    // never stored in D1, never returned to clients, never logged.
    AI_CREDENTIALS_ENCRYPTION_KEY?: string;

    // In-app agent (SAM) overrides. AI_AGENT_PROVIDER picks the deployment
    // default provider (defaults to openrouter); AI_AGENT_MODEL overrides the
    // provider default model; AI_AGENT_MAX_TOOL_CALLS bounds the number of
    // tool calls per turn and AI_AGENT_MAX_STEPS bounds inference steps
    // (defaults in SamChatAgent.ts).
    AI_AGENT_PROVIDER?: string;
    AI_AGENT_MODEL?: string;
    AI_AGENT_MAX_TOOL_CALLS?: string;
    AI_AGENT_MAX_STEPS?: string;
    // Long-running tool polling (site audits): exponential backoff between
    // status reads, attempt cap, and overall wall-clock window per wait
    // (defaults in samTurnControls.ts).
    AI_AGENT_POLL_INITIAL_MS?: string;
    AI_AGENT_POLL_MAX_MS?: string;
    AI_AGENT_MAX_POLL_ATTEMPTS?: string;
    AI_AGENT_TOOL_TIMEOUT_MS?: string;
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
  /** Developer-only: force the SAM Debug Trace panel on in production builds. */
  readonly VITE_SAM_DEBUG_TRACE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
