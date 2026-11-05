import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { guestAccounts, member, user as authUser } from "@/db/schema";

async function countForIpHash(ipHash: string) {
  const [row] = await db
    .select({ value: count() })
    .from(guestAccounts)
    .where(eq(guestAccounts.ipHash, ipHash));
  return row?.value ?? 0;
}

async function createGuestUser(input: {
  userId: string;
  email: string;
  ipHash: string;
  claimToken: string;
  analyticsOptedOut: boolean;
}) {
  const now = new Date();
  await runBatch((tx) => [
    tx.insert(authUser).values({
      id: input.userId,
      name: "Guest",
      email: input.email,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      analyticsOptedOut: input.analyticsOptedOut,
    }),
    tx.insert(guestAccounts).values({
      userId: input.userId,
      ipHash: input.ipHash,
      claimToken: input.claimToken,
      createdAt: now.toISOString(),
    }),
  ]);
}

/** The guest behind a claim token, while its user and organization exist. */
async function findUnclaimedGuest(claimToken: string) {
  const [row] = await db
    .select({ userId: member.userId, organizationId: member.organizationId })
    .from(guestAccounts)
    .innerJoin(member, eq(member.userId, guestAccounts.userId))
    .where(eq(guestAccounts.claimToken, claimToken))
    .limit(1);
  return row ?? null;
}

/**
 * Hands the guest's organization to `toUserId`, then deletes the guest user.
 * Projects and credits belong to the organization, so nothing else moves; the
 * per-user rows that cascade from the guest (sessions, onboarding answers)
 * mean nothing once claimed. Nobody else can join a guest's organization, so
 * `toUserId` is never already a member of it.
 */
async function transferToUser(guestUserId: string, toUserId: string) {
  await runBatch((tx) => [
    tx
      .update(member)
      .set({ userId: toUserId })
      .where(eq(member.userId, guestUserId)),
    tx.delete(authUser).where(eq(authUser.id, guestUserId)),
  ]);
}

export const GuestAccountRepository = {
  countForIpHash,
  createGuestUser,
  findUnclaimedGuest,
  transferToUser,
} as const;
