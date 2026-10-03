import { z } from "zod";
import { hasHostedTurnstileConfig } from "@/lib/auth-turnstile";

type HostedAuthEnv = {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BYPASS_EMAIL_VERIFICATION?: string;
  LOOPS_API_KEY?: string;
  LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID?: string;
  LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

// https in production. Plain http is allowed on localhost and its subdomains
// (the portless `pnpm dev:agents` URLs like <branch>.localhost), so hosted
// auth stays runnable behind the dev proxy.
const hostedBaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname.endsWith(".localhost")))
    );
  }, "BETTER_AUTH_URL must use https, localhost, or a *.localhost subdomain");

export function parseHostedBaseUrl(baseUrl: string | undefined) {
  const trimmed = baseUrl?.trim();

  if (!trimmed) {
    throw new Error("BETTER_AUTH_URL is required in hosted mode");
  }

  const parsed = hostedBaseUrlSchema.safeParse(trimmed);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "BETTER_AUTH_URL is invalid",
    );
  }

  return parsed.data;
}

// Required in hosted mode, and in self-hosted mode when Search Console is
// enabled (it keys the OAuth-token encryption and is needed to build the auth
// instance that mints/refreshes Search Console tokens).
export function requireHostedSecret(secret: string | undefined) {
  const trimmed = secret?.trim();

  if (!trimmed) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  if (trimmed.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  }

  return trimmed;
}

export function requireGoogleSocialProviderConfig(env: HostedAuthEnv) {
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is required in hosted mode");
  }

  if (!googleClientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is required in hosted mode");
  }

  return { clientId: googleClientId, clientSecret: googleClientSecret };
}

function hasHostedAuthEmailConfig(env: HostedAuthEnv) {
  const loopsVars = [
    "LOOPS_API_KEY",
    "LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID",
    "LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID",
  ] as const;

  return loopsVars.every((name) => {
    const value = env[name];
    return typeof value === "string" && value.trim() !== "";
  });
}

// Returns why the hosted auth configuration is incomplete, naming the
// variable to set, or null when it is complete. The /api/auth and middleware
// 500s embed this so a misconfigured deployment says what to fix instead of a
// bare "missing configuration".
export function getMissingHostedAuthConfigVariable(
  env: HostedAuthEnv,
): string | null {
  const throwingChecks = [
    () => parseHostedBaseUrl(env.BETTER_AUTH_URL),
    () => requireHostedSecret(env.BETTER_AUTH_SECRET),
    () => requireGoogleSocialProviderConfig(env),
  ];

  for (const check of throwingChecks) {
    try {
      check();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  if (!hasHostedTurnstileConfig(env)) {
    return "TURNSTILE_SECRET_KEY is required when TURNSTILE_SITE_KEY is set";
  }

  if (
    env.BYPASS_EMAIL_VERIFICATION !== "true" &&
    !hasHostedAuthEmailConfig(env)
  ) {
    return "BETTER_AUTH_URL email delivery requires LOOPS_API_KEY, LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID, and LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID, or BYPASS_EMAIL_VERIFICATION=true";
  }

  return null;
}
