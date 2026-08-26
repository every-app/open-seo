import { eq } from "drizzle-orm";
import { db } from "@/db";
import { serperConnection } from "@/db/schema";

/**
 * Deployment-wide Serper.dev module state: a single row holding the API key
 * plus the enabled flag that shows or hides the whole PAA + Social Mining
 * feature. The SERPER_API_KEY env var, when set, always wins over the stored
 * key (DataForSEO-style operators keep full control).
 */
const ROW_ID = "default";

export const SerperConnectionRepository = {
  async getState(): Promise<{ apiKey: string | null; enabled: boolean }> {
    const rows = await db
      .select({
        apiKey: serperConnection.apiKey,
        enabled: serperConnection.enabled,
      })
      .from(serperConnection)
      .where(eq(serperConnection.id, ROW_ID))
      .limit(1);
    return rows[0] ?? { apiKey: null, enabled: true };
  },

  async getApiKey(): Promise<string | null> {
    return (await this.getState()).apiKey;
  },

  async saveApiKey(apiKey: string): Promise<void> {
    const connectedAt = new Date().toISOString();
    await db
      .insert(serperConnection)
      .values({ id: ROW_ID, apiKey, connectedAt })
      .onConflictDoUpdate({
        target: serperConnection.id,
        set: { apiKey, connectedAt },
      });
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await db
      .insert(serperConnection)
      .values({ id: ROW_ID, enabled })
      .onConflictDoUpdate({
        target: serperConnection.id,
        set: { enabled },
      });
  },
};
