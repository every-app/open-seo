import { and, eq, gt, like, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { verification } from "@/db/schema";

/**
 * Single-use OAuth state for the Bing grant flow (bingOAuth.ts). Same shape
 * as the Google flow's state, minus PKCE — Bing exchanges the code with the
 * client secret alone. The state is a random nonce whose payload lives in
 * Better Auth's `verification` table and is deleted the moment a callback
 * presents it, so a captured consent URL cannot be replayed.
 */

const STATE_TTL_MS = 10 * 60 * 1_000;
const STATE_IDENTIFIER_PREFIX = "bing-link:";

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

function stateIdentifier(state: string) {
  return `${STATE_IDENTIFIER_PREFIX}${state}`;
}

/** Persist a fresh state and return the nonce to send to Bing. */
export async function createState(input: {
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
    identifier: stateIdentifier(state),
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
export async function consumeState(input: { state: string | null }) {
  if (!input.state) return null;
  const [row] = await db
    .delete(verification)
    .where(
      and(
        eq(verification.identifier, stateIdentifier(input.state)),
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
