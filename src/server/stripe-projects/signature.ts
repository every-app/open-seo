import { constantTimeEqual } from "better-auth/crypto";

// Stripe signs every Stripe Projects provisioning request the way it signs
// webhooks: `Stripe-Signature: t=<unix seconds>,v1=<hex>` where the hex is
// HMAC-SHA256(secret, "<t>.<raw body>"). GET requests sign an empty body.
// While Stripe rotates the secret the header carries one v1 per secret, so any
// match is accepted. The five-minute window is Stripe's own replay tolerance.
const TOLERANCE_SECONDS = 5 * 60;

export async function verifyStripeSignature(args: {
  header: string | null;
  payload: string;
  secret: string;
}) {
  const parts = (args.header ?? "").split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(args.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${timestamp}.${args.payload}`),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

  return parts.some(
    ([name, value]) =>
      name === "v1" && !!value && constantTimeEqual(expected, value),
  );
}
