import { db } from "@/db";
import { delegatedUsers } from "@/db/schema";
import { ensureDelegatedOrganizationForUser } from "@/server/auth/delegated-organization";
import { eq } from "drizzle-orm";
import type { EnsuredUserContext } from "./types";

const LOCAL_ADMIN_USER_ID = "local-admin";
const LOCAL_ADMIN_EMAIL = "admin@localhost";

async function ensureUserRecord(userId: string, userEmail: string) {
  const existingUser = await db.query.delegatedUsers.findFirst({
    where: eq(delegatedUsers.id, userId),
  });

  if (!existingUser) {
    await db.insert(delegatedUsers).values({
      id: userId,
      email: userEmail,
    });

    return userEmail;
  }

  if (existingUser.email !== userEmail) {
    await db
      .update(delegatedUsers)
      .set({ email: userEmail })
      .where(eq(delegatedUsers.id, userId));

    return userEmail;
  }

  return existingUser.email;
}

export async function resolveDelegatedContext(
  userId: string,
  userEmail: string,
): Promise<EnsuredUserContext> {
  const ensuredEmail = await ensureUserRecord(userId, userEmail);
  const organizationId = await ensureDelegatedOrganizationForUser(
    userId,
    ensuredEmail,
  );

  return {
    userId,
    userEmail: ensuredEmail,
    organizationId,
  };
}

export async function resolveLocalNoAuthContext(): Promise<EnsuredUserContext> {
  return resolveDelegatedContext(LOCAL_ADMIN_USER_ID, LOCAL_ADMIN_EMAIL);
}
