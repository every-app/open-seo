import { eq } from "drizzle-orm";
import { db } from "@/db";
import { onpageConnection } from "@/db/schema";

/**
 * Deployment-wide On-Page.ai module state: a single row holding the API key
 * delivered by the guided connect flow plus the enabled flag that shows or
 * hides the whole Content Optimization feature. The ONPAGE_API_KEY env var,
 * when set, always wins over the stored key (DataForSEO-style operators keep
 * full control).
 */
const ROW_ID = "default";

export const OnPageConnectionRepository = {
  async getState(): Promise<{ apiKey: string | null; enabled: boolean }> {
    const rows = await db
      .select({
        apiKey: onpageConnection.apiKey,
        enabled: onpageConnection.enabled,
      })
      .from(onpageConnection)
      .where(eq(onpageConnection.id, ROW_ID))
      .limit(1);
    return rows[0] ?? { apiKey: null, enabled: true };
  },

  async getApiKey(): Promise<string | null> {
    return (await this.getState()).apiKey;
  },

  async saveApiKey(apiKey: string): Promise<void> {
    const connectedAt = new Date().toISOString();
    await db
      .insert(onpageConnection)
      .values({ id: ROW_ID, apiKey, connectedAt })
      .onConflictDoUpdate({
        target: onpageConnection.id,
        set: { apiKey, connectedAt },
      });
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await db
      .insert(onpageConnection)
      .values({ id: ROW_ID, enabled })
      .onConflictDoUpdate({
        target: onpageConnection.id,
        set: { enabled },
      });
  },
};
