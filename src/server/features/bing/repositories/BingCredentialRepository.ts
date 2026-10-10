import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bingCredentials } from "@/db/schema";

type BingCredential = typeof bingCredentials.$inferSelect;

/** Every Bing API key the user has stored (one per Bing account). */
async function listForUser(userId: string): Promise<BingCredential[]> {
  return db
    .select()
    .from(bingCredentials)
    .where(eq(bingCredentials.userId, userId));
}

async function getById(
  userId: string,
  credentialId: string,
): Promise<BingCredential | null> {
  const rows = await db
    .select()
    .from(bingCredentials)
    .where(
      and(
        eq(bingCredentials.userId, userId),
        eq(bingCredentials.id, credentialId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function insert(input: {
  userId: string;
  apiKey: string;
  keyLast4: string;
}): Promise<BingCredential> {
  const [row] = await db
    .insert(bingCredentials)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  if (!row) {
    throw new Error("Failed to insert bing_credential");
  }
  return row;
}

async function deleteById(userId: string, credentialId: string): Promise<void> {
  await db
    .delete(bingCredentials)
    .where(
      and(
        eq(bingCredentials.userId, userId),
        eq(bingCredentials.id, credentialId),
      ),
    );
}

export const BingCredentialRepository = {
  listForUser,
  getById,
  insert,
  deleteById,
};
