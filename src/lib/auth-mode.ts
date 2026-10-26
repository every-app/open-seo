import { z } from "zod";

// - cloudflare_access / local_noauth: self-hosted, identity comes from outside
//   the app (an Access JWT, or a fixed local admin); no accounts of its own.
// - hosted: OpenSEO Cloud. Better Auth accounts plus the hosted business
//   services: billing, transactional email, Turnstile, Google sign-in, telemetry.
// - password: self-hosted with the app's own accounts (the Docker
//   standalone edition and the Cloudflare self-host). Better Auth accounts
//   (email and password, organizations, invitations, API keys) with none of
//   the hosted business services; the first visitor creates the
//   administrator's account and invitations add the rest.
export const AUTH_MODES = [
  "cloudflare_access",
  "local_noauth",
  "hosted",
  "password",
  // Behind an Every App gateway, which signs each request's identity and
  // holds the provider keys (docs/maintainers/every-app.md).
  "everyapp",
] as const;

type AuthMode = (typeof AUTH_MODES)[number];

const authModeSchema = z.enum(AUTH_MODES);

const warnedInvalidAuthModes = new Set<string>();

export function getAuthMode(value: string | null | undefined): AuthMode {
  const parsed = authModeSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  // Unset stays a silent fail-closed default; a SET-but-invalid value is a
  // typo the operator needs to hear about — silently coercing it made every
  // request fail with a Cloudflare Access error about a mode they never chose.
  if (value && !warnedInvalidAuthModes.has(value)) {
    warnedInvalidAuthModes.add(value);
    console.error(
      `Invalid AUTH_MODE "${value}" — falling back to "cloudflare_access". Valid values: ${AUTH_MODES.join(", ")}.`,
    );
  }

  return "cloudflare_access";
}

export function isHostedAuthMode(value: string | null | undefined) {
  return getAuthMode(value) === "hosted";
}

// True when the app runs its own accounts (sessions, organizations,
// invitations, API keys): hosted and password modes. Gate billing, email, and
// other OpenSEO Cloud services on isHostedAuthMode, never on this.
export function usesBetterAuth(value: string | null | undefined) {
  const mode = getAuthMode(value);
  return mode === "hosted" || mode === "password";
}

// The client bundle inlines AUTH_MODE at build time (vite envPrefix), so a
// deployment must build and run with the same value. The standalone Docker
// image is built once and picks its mode when it starts, so the server records
// its runtime mode per request (server.ts) and prints it into the document
// (__root.tsx) for the browser; both sides prefer that value and fall back to
// the build-time one, which is what every other deployment still relies on.
declare global {
  // `var` is how a property of globalThis is declared.
  var __OPENSEO_AUTH_MODE__: string | undefined;
}

export function setRuntimeAuthMode(value: string | undefined) {
  globalThis.__OPENSEO_AUTH_MODE__ = value;
}

export function getClientAuthMode() {
  return getAuthMode(
    globalThis.__OPENSEO_AUTH_MODE__ ?? import.meta.env.AUTH_MODE,
  );
}

export function runtimeAuthModeScript() {
  return `globalThis.__OPENSEO_AUTH_MODE__=${JSON.stringify(getClientAuthMode())}`;
}

export function isEveryAppAuthMode(value: string | null | undefined) {
  return getAuthMode(value) === "everyapp";
}

export function isHostedClientAuthMode() {
  return getClientAuthMode() === "hosted";
}

export function usesBetterAuthClient() {
  return usesBetterAuth(getClientAuthMode());
}

export function isEveryAppClientAuthMode() {
  return isEveryAppAuthMode(getClientAuthMode());
}

export function isEmailVerificationBypassed() {
  // Local-dev escape hatch (BYPASS_EMAIL_VERIFICATION=true). The server skips
  // verification and never marks users emailVerified, so the client must treat
  // the session as verified too — otherwise route guards and /verify-email
  // bounce each other in an infinite redirect loop.
  // Password mode has no email transport: accounts are created in the browser
  // (first visitor, invitation links) or by the operator and never confirm an
  // address.
  return (
    import.meta.env.BYPASS_EMAIL_VERIFICATION === "true" ||
    getClientAuthMode() === "password"
  );
}
