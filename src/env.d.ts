// Custom environment variable type definitions
// These extend the auto-generated Env interface from worker-configuration.d.ts

declare namespace Cloudflare {
  interface Env {
    R2: R2Bucket;

    AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted";
    TEAM_DOMAIN?: string;
    POLICY_AUD?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;

    // DataForSEO API Basic auth value (base64 of login:password)
    DATAFORSEO_API_KEY: string;
  }
}

interface ImportMetaEnv {
  readonly AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
