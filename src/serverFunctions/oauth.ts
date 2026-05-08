import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { oauthClient } from "@/db/better-auth-schema";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

const getOAuthClientInfoSchema = z.object({
  clientId: z.string().min(1),
});

export const getOAuthClientInfo = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .inputValidator((data: unknown) => getOAuthClientInfoSchema.parse(data))
  .handler(async ({ data }) => {
    const row = await db
      .select({
        name: oauthClient.name,
        icon: oauthClient.icon,
        uri: oauthClient.uri,
      })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, data.clientId))
      .get();

    if (!row) return null;

    return {
      name: row.name ?? null,
      icon: row.icon ?? null,
      uri: row.uri ?? null,
    };
  });
