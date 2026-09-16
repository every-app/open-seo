import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bingApiKeys } from "@/db/schema";

type BingApiKeyRow = typeof bingApiKeys.$inferSelect;

async function getByUserId(userId: string): Promise<BingApiKeyRow | null> {
  const rows = await db
    .select()
    .from(bingApiKeys)
    .where(eq(bingApiKeys.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  userId: string;
  encryptedApiKey: string;
}): Promise<BingApiKeyRow> {
  const [row] = await db
    .insert(bingApiKeys)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: bingApiKeys.userId,
      set: {
        encryptedApiKey: input.encryptedApiKey,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert bing_api_key");
  }
  return row;
}

async function deleteByUserId(userId: string): Promise<void> {
  await db.delete(bingApiKeys).where(eq(bingApiKeys.userId, userId));
}

export const BingApiKeyRepository = {
  getByUserId,
  upsert,
  deleteByUserId,
};
