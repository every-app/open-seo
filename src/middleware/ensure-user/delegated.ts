import { db } from "@/db";
import { user } from "@/db/schema";
import { ensureDelegatedOrganizationForUser } from "@/server/auth/delegated-organization";
import { eq } from "drizzle-orm";
import type { EnsuredUserContext } from "./types";

const LOCAL_ADMIN_USER_ID = "local-admin";
const LOCAL_ADMIN_EMAIL = "admin@localhost";

// Externally-authenticated users (Cloudflare Access, local_noauth) are stored
// in better-auth's `user` table just like hosted users — only the way we
// authenticate them differs (per-request, no better-auth session). Keeping a
// single user table means the OAuth `account` grant and every app table that
// references `user.id` resolve the same way in all auth modes.
function deriveUserName(email: string) {
  return email.split("@")[0] || "OpenSEO";
}

async function ensureUserRecord(userId: string, userEmail: string) {
  const existing = await db.query.user.findFirst({
    columns: { email: true },
    where: eq(user.id, userId),
  });

  if (!existing) {
    // Concurrent first-load requests can all see "no row" and race to insert
    // the same id; onConflictDoNothing on the PK makes the losers no-ops instead
    // of failing. Scoped to the id so a genuine email-unique collision (two
    // distinct ids sharing an email) still surfaces loudly.
    await db
      .insert(user)
      .values({
        id: userId,
        name: deriveUserName(userEmail),
        email: userEmail,
        emailVerified: true,
      })
      .onConflictDoNothing({ target: user.id });

    return userEmail;
  }

  if (existing.email !== userEmail) {
    await db
      .update(user)
      .set({ email: userEmail, name: deriveUserName(userEmail) })
      .where(eq(user.id, userId));

    return userEmail;
  }

  return existing.email;
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
