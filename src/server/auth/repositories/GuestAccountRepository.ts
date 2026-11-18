import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { isUniqueViolation } from "@/db/isUniqueViolation";
import { runBatch } from "@/db/runBatch";
import { guestAccounts, member, user as authUser } from "@/db/schema";

async function countForIpHash(ipHash: string) {
  const [row] = await db
    .select({ value: count() })
    .from(guestAccounts)
    .where(eq(guestAccounts.ipHash, ipHash));
  return row?.value ?? 0;
}

/**
 * Inserts the guest user into `slot` for its IP. Returns false, inserting
 * nothing, when another guest already took that slot: a concurrent request
 * that counted the same guests won the race.
 */
async function createGuestUser(input: {
  userId: string;
  email: string;
  ipHash: string;
  slot: number;
  agent: string | null;
  claimToken: string;
  analyticsOptedOut: boolean;
}) {
  const now = new Date();
  try {
    await runBatch((tx) => [
      tx.insert(guestAccounts).values({
        userId: input.userId,
        ipHash: input.ipHash,
        slot: input.slot,
        agent: input.agent,
        claimToken: input.claimToken,
        createdAt: now.toISOString(),
      }),
      tx.insert(authUser).values({
        id: input.userId,
        name: "Guest",
        email: input.email,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
        analyticsOptedOut: input.analyticsOptedOut,
      }),
    ]);
    return true;
  } catch (error) {
    // The ids, email, and claim token are random, so the slot is the only
    // unique key this insert can collide on.
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

async function hasMembership(userId: string) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return Boolean(row);
}

/** The guest behind a claim token, while its user and organization exist. */
async function findUnclaimedGuest(claimToken: string) {
  const [row] = await db
    .select({
      userId: member.userId,
      organizationId: member.organizationId,
      agent: guestAccounts.agent,
    })
    .from(guestAccounts)
    .innerJoin(member, eq(member.userId, guestAccounts.userId))
    .where(eq(guestAccounts.claimToken, claimToken))
    .limit(1);
  return row ?? null;
}

/**
 * Hands the guest's organization to `toUserId`, records the claim, then
 * deletes the guest user. Projects and credits belong to the organization, so
 * nothing else moves; the per-user rows that cascade from the guest (sessions,
 * onboarding answers) mean nothing once claimed. Nobody else can join a
 * guest's organization, so `toUserId` is never already a member of it.
 */
async function transferToUser(guestUserId: string, toUserId: string) {
  await runBatch((tx) => [
    tx
      .update(member)
      .set({ userId: toUserId })
      .where(eq(member.userId, guestUserId)),
    tx
      .update(guestAccounts)
      .set({ claimedByUserId: toUserId })
      .where(eq(guestAccounts.userId, guestUserId)),
    tx.delete(authUser).where(eq(authUser.id, guestUserId)),
  ]);
}

/** The account that claimed this guest, while that account exists. */
async function findClaimingUser(guestUserId: string) {
  const [row] = await db
    .select({ userId: authUser.id, email: authUser.email })
    .from(guestAccounts)
    .innerJoin(authUser, eq(authUser.id, guestAccounts.claimedByUserId))
    .where(eq(guestAccounts.userId, guestUserId))
    .limit(1);
  return row ?? null;
}

/** The guests this account claimed: their agent connections are its now. */
async function listClaimedGuestUserIds(userId: string) {
  const rows = await db
    .select({ userId: guestAccounts.userId })
    .from(guestAccounts)
    .where(eq(guestAccounts.claimedByUserId, userId));
  return rows.map((row) => row.userId);
}

export const GuestAccountRepository = {
  countForIpHash,
  createGuestUser,
  findClaimingUser,
  findUnclaimedGuest,
  hasMembership,
  listClaimedGuestUserIds,
  transferToUser,
} as const;
