import { z } from "zod";

type AuthMode = "cloudflare_access" | "local_noauth" | "hosted";

const authModeSchema = z
  .enum(["cloudflare_access", "local_noauth", "hosted"])
  .catch("cloudflare_access");

export function getAuthMode(value: string | null | undefined): AuthMode {
  return authModeSchema.parse(value);
}

export function isHostedAuthMode(value: string | null | undefined) {
  return getAuthMode(value) === "hosted";
}

export function isHostedClientAuthMode() {
  // This is an explicit deploy-time contract: the operator must keep the
  // client build-time AUTH_MODE aligned with the server runtime AUTH_MODE.
  // We accept that tradeoff to avoid a startup round-trip just to ask the
  // backend which auth UI to render. Hosted deployments must therefore set
  // AUTH_MODE=hosted in both the client build environment and the runtime.
  return isHostedAuthMode(import.meta.env.AUTH_MODE);
}
