import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { dataRefreshClaims } from "@/db/schema";

// Longer than the provider's request timeout; failed requests back off rather
// than spending again on every visit. The token fences an expired owner.
async function claim(key: string, organizationId: string) {
  const now = Date.now();
  const token = crypto.randomUUID();
  const [row] = await db
    .insert(dataRefreshClaims)
    .values({
      key,
      organizationId,
      token,
      nextAttemptAt: now + 180_000,
    })
    .onConflictDoUpdate({
      target: dataRefreshClaims.key,
      set: { token, nextAttemptAt: now + 180_000 },
      setWhere: and(
        eq(dataRefreshClaims.organizationId, organizationId),
        lte(dataRefreshClaims.nextAttemptAt, now),
      ),
    })
    .returning({ token: dataRefreshClaims.token });
  return row?.token ?? null;
}

async function finish(key: string, token: string, delayMs: number) {
  await db
    .update(dataRefreshClaims)
    .set({ nextAttemptAt: Date.now() + delayMs })
    .where(
      and(eq(dataRefreshClaims.key, key), eq(dataRefreshClaims.token, token)),
    );
}

export const DataRefreshClaimRepository = { claim, finish };
