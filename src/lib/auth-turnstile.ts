import { isHostedAuthMode } from "@/lib/auth-mode";

type TurnstileAuthEnv = {
  AUTH_MODE?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
};

export function getHostedTurnstileSecretKey(env: TurnstileAuthEnv) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return undefined;
  }

  return env.TURNSTILE_SECRET_KEY?.trim() || undefined;
}

export function hasHostedTurnstileConfig(env: TurnstileAuthEnv) {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim();

  // No runtime site key means the Worker is allowed to rely on a client build
  // value while still enforcing with the server secret when it is present. If a
  // runtime site key is configured, require the matching secret so the hosted
  // auth route fails closed instead of showing a non-enforced captcha.
  return !siteKey || Boolean(secretKey);
}
