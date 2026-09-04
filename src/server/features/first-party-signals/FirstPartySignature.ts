import { hexToBytes } from "./encoding";
import { FIRST_PARTY_SIGNATURE_MAX_SKEW_MS } from "@/shared/first-party-signals";

export function parseSignatureTimestamp(
  value: string | null,
  now = Date.now(),
): string | null {
  if (!value || !/^\d{10}(?:\d{3})?$/.test(value)) return null;
  const numeric = Number(value);
  const timestampMs = value.length === 10 ? numeric * 1_000 : numeric;
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(now - timestampMs) > FIRST_PARTY_SIGNATURE_MAX_SKEW_MS
  ) {
    return null;
  }
  return value;
}

function signedBytes(timestamp: string, rawBody: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + rawBody.length);
  message.set(prefix);
  message.set(rawBody, prefix.length);
  return message;
}

export async function verifyFirstPartySignature(input: {
  secret: string;
  timestamp: string;
  rawBody: Uint8Array;
  signature: string | null;
}): Promise<boolean> {
  const normalized = input.signature?.replace(/^sha256=/i, "") ?? "";
  const signature = hexToBytes(normalized);
  if (!signature || signature.byteLength !== 32) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signature).buffer,
    new Uint8Array(signedBytes(input.timestamp, input.rawBody)).buffer,
  );
}
