import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gt,
  lt,
  notExists,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  invitation,
  member,
  organization,
  user as authUser,
} from "@/db/schema";

type DelegatedOrganizationInput = {
  id: string;
  name: string;
  slug: string;
};

async function upsertDelegatedOrganization(input: DelegatedOrganizationInput) {
  await db
    .insert(organization)
    .values({
      id: input.id,
      name: input.name,
      slug: input.slug,
      logo: null,
      createdAt: new Date(),
      metadata: null,
    })
    .onConflictDoUpdate({
      target: organization.id,
      set: {
        name: input.name,
        slug: input.slug,
      },
    });
}

async function findFirstOrganizationIdForUser(userId: string) {
  const [existingMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);

  return existingMembership?.organizationId ?? null;
}

// Founded = the user is the org's earliest member (its creator), not merely
// an owner: a later-promoted invitee must never count as founding an org.
async function findFirstFoundedOrganizationIdForUser(userId: string) {
  const earlierMember = aliasedTable(member, "earlier_member");
  const [foundedMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.role, "owner"),
        notExists(
          db
            .select({ id: earlierMember.id })
            .from(earlierMember)
            .where(
              and(
                eq(earlierMember.organizationId, member.organizationId),
                lt(earlierMember.createdAt, member.createdAt),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(member.createdAt))
    .limit(1);

  return foundedMembership?.organizationId ?? null;
}

async function getHostedUser(userId: string) {
  return db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
    },
    where: eq(authUser.id, userId),
  });
}

// The per-request membership check: session.activeOrganizationId is only an
// identity hint, this row is the authorization fact. Returns null when the
// user is not (or no longer) a member.
async function getMembership(userId: string, organizationId: string) {
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);

  return membership ?? null;
}

// Fallback active-org choice when there is no valid last-active pointer: the
// most recently joined org, so a just-accepted invitation wins over the
// signup-minted personal workspace.
async function findNewestMembershipForUser(userId: string) {
  const [membership] = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(desc(member.createdAt))
    .limit(1);

  return membership ?? null;
}

async function listMembershipsForUser(userId: string) {
  return db
    .select({
      organizationId: member.organizationId,
      organizationName: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
}

// Case-insensitive on purpose: better-auth lowercases the address when it
// mails an invite, but the stored row keeps whatever the inviter typed.
async function hasPendingInvitationForEmail(email: string) {
  const [pending] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(sql`lower(${invitation.email})`, email.trim().toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return pending !== undefined;
}

async function getLastActiveOrganizationId(userId: string) {
  const record = await db.query.user.findFirst({
    columns: { lastActiveOrganizationId: true },
    where: eq(authUser.id, userId),
  });

  return record?.lastActiveOrganizationId ?? null;
}

async function setLastActiveOrganization(
  userId: string,
  organizationId: string,
) {
  await db
    .update(authUser)
    .set({ lastActiveOrganizationId: organizationId })
    .where(eq(authUser.id, userId));
}

export const AuthRepository = {
  upsertDelegatedOrganization,
  findFirstOrganizationIdForUser,
  findFirstFoundedOrganizationIdForUser,
  findNewestMembershipForUser,
  getMembership,
  listMembershipsForUser,
  getLastActiveOrganizationId,
  setLastActiveOrganization,
  getHostedUser,
  hasPendingInvitationForEmail,
} as const;
