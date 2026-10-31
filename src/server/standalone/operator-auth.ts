import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const MIN_OPERATOR_SECRET_LENGTH = 32;

// The standalone Docker edition generates this secret at initialization
// (scripts/celld/runtime/configure.mjs) and a Cloudflare self-hoster sets it
// in .env.selfhost when they need the account commands; hosted and the modes
// whose identity comes from outside the app never set it, so everything it
// gates stays off there. A value too short for isOperatorRequest counts as
// unset.
export function hasOperatorSecret(): boolean {
  const secret: unknown = Reflect.get(env, "OPENSEO_OPERATOR_SECRET");
  return (
    typeof secret === "string" && secret.length >= MIN_OPERATOR_SECRET_LENGTH
  );
}

export function isOperatorRequest(headers: Headers | undefined): boolean {
  const secret: unknown = Reflect.get(env, "OPENSEO_OPERATOR_SECRET");
  const supplied = headers?.get("x-openseo-operator-secret");
  if (!hasOperatorSecret() || typeof secret !== "string" || !supplied)
    return false;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
