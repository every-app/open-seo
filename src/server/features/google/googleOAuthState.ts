import { and, eq, gt, like, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { verification } from "@/db/schema";
import type { GoogleLinkProvider } from "@/shared/google-link";

/**
 * Single-use OAuth state and PKCE for the Google data-grant flow
 * (googleOAuth.ts). The state is a random nonce whose payload lives in Better
 * Auth's `verification` table and is deleted the moment a callback presents
 * it, so a captured consent URL cannot be replayed. The PKCE verifier is an
 * HMAC of that nonce.
 */

const STATE_TTL_MS = 10 * 60 * 1_000;
const STATE_IDENTIFIER_PREFIX = "google-link:";

const oauthStateSchema = z.object({
  userId: z.string().min(1),
  callbackPath: z.string().min(1),
});

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function stateIdentifier(provider: GoogleLinkProvider, state: string) {
  return `${STATE_IDENTIFIER_PREFIX}${provider}:${state}`;
}

export async function getCodeVerifier(input: {
  state: string;
  clientSecret: string;
  provider: GoogleLinkProvider;
}) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      `openseo:${input.provider}:pkce:${input.clientSecret}`,
    ),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input.state),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function getCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

/** Persist a fresh state and return the nonce to send to Google. */
export async function createState(input: {
  provider: GoogleLinkProvider;
  userId: string;
  callbackPath: string;
}) {
  const state = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const now = new Date();
  // Abandoned consents never come back to delete their row; sweep them here
  // so the table does not grow without bound.
  await db
    .delete(verification)
    .where(
      and(
        like(verification.identifier, `${STATE_IDENTIFIER_PREFIX}%`),
        lt(verification.expiresAt, now),
      ),
    );
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: stateIdentifier(input.provider, state),
    value: JSON.stringify({
      userId: input.userId,
      callbackPath: input.callbackPath,
    }),
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });
  return state;
}

/**
 * Atomically delete and return the state's payload, or null when it is
 * unknown, already used, or expired. Two callbacks racing on one state can
 * only have one winner.
 */
export async function consumeState(input: {
  state: string | null;
  provider: GoogleLinkProvider;
}) {
  if (!input.state) return null;
  const [row] = await db
    .delete(verification)
    .where(
      and(
        eq(
          verification.identifier,
          stateIdentifier(input.provider, input.state),
        ),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .returning({ value: verification.value });
  if (!row) return null;
  try {
    return oauthStateSchema.parse(JSON.parse(row.value));
  } catch {
    return null;
  }
}
