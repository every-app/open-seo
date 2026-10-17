import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
  lt,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
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

// AUTH_MODE=everyapp, first party: the gateway's organization, created the
// first time one of its members opens OpenSEO. The name is set once; the
// gateway owns the real one and OpenSEO shows no organization names here.
async function ensureOrganization(input: DelegatedOrganizationInput) {
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
    .onConflictDoNothing({ target: organization.id });
}

// The member row mirrors the gateway's membership for features that list who
// belongs to an organization. It is never the authorization fact in this
// mode: the signed identity on each request is (ensure-user/everyApp.ts).
async function upsertMember(input: {
  organizationId: string;
  userId: string;
  role: string;
}) {
  await db
    .insert(member)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [member.organizationId, member.userId],
      set: { role: input.role },
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

async function getOrganizationOwner(organizationId: string) {
  const [owner] = await db
    .select({ id: authUser.id, email: authUser.email })
    .from(member)
    .innerJoin(authUser, eq(authUser.id, member.userId))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
    )
    .limit(1);
  return owner ?? null;
}

/** Names for a set of user ids in one query; missing ids are simply absent. */
async function getHostedUserNames(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db
    .select({ id: authUser.id, name: authUser.name })
    .from(authUser)
    .where(inArray(authUser.id, userIds));
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

async function getMemberInOrganization(
  memberId: string,
  organizationId: string,
) {
  const [membership] = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, organizationId)),
    )
    .limit(1);

  return membership ?? null;
}

// Promotes the new owner and demotes the current owner to admin in one atomic
// batch. Each update re-checks the other member row, so a concurrent removal
// or role change turns the whole transfer into a no-op instead of leaving the
// org with two owners or none. Naming the owner's own member row is a no-op too.
async function transferOwnership(input: {
  organizationId: string;
  ownerUserId: string;
  newOwnerMemberId: string;
}) {
  const currentOwner = aliasedTable(member, "current_owner");
  const newOwner = aliasedTable(member, "new_owner");

  await runBatch((tx) => [
    // Row-lock both members first. Postgres runs the batch as a READ
    // COMMITTED transaction, so without this a concurrent transfer could
    // promote a second member, or a removal could land between the two
    // updates. A blocked transaction resumes after this one commits and its
    // re-checks then see the new roles. No-op write on D1, whose batch is
    // already serialized.
    tx
      .update(member)
      .set({ role: sql`${member.role}` })
      .where(
        and(
          eq(member.organizationId, input.organizationId),
          or(
            eq(member.userId, input.ownerUserId),
            eq(member.id, input.newOwnerMemberId),
          ),
        ),
      ),
    tx
      .update(member)
      .set({ role: "owner" })
      .where(
        and(
          eq(member.id, input.newOwnerMemberId),
          eq(member.organizationId, input.organizationId),
          exists(
            tx
              .select({ id: currentOwner.id })
              .from(currentOwner)
              .where(
                and(
                  eq(currentOwner.organizationId, input.organizationId),
                  eq(currentOwner.userId, input.ownerUserId),
                  eq(currentOwner.role, "owner"),
                ),
              ),
          ),
        ),
      ),
    tx
      .update(member)
      .set({ role: "admin" })
      .where(
        and(
          eq(member.organizationId, input.organizationId),
          eq(member.userId, input.ownerUserId),
          eq(member.role, "owner"),
          exists(
            tx
              .select({ id: newOwner.id })
              .from(newOwner)
              .where(
                and(
                  eq(newOwner.id, input.newOwnerMemberId),
                  eq(newOwner.organizationId, input.organizationId),
                  ne(newOwner.userId, input.ownerUserId),
                  eq(newOwner.role, "owner"),
                ),
              ),
          ),
        ),
      ),
  ]);
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

async function isAnalyticsOptedOut(userId: string) {
  const [record] = await db
    .select({ analyticsOptedOut: authUser.analyticsOptedOut })
    .from(authUser)
    .where(eq(authUser.id, userId))
    .limit(1);
  return record?.analyticsOptedOut === true;
}

async function setTermsAcceptance(
  userId: string,
  version: string,
  acceptedAt: Date,
) {
  await db
    .update(authUser)
    .set({ termsAcceptedVersion: version, termsAcceptedAt: acceptedAt })
    .where(eq(authUser.id, userId));
}

async function setProductUpdatesOptIn(
  userId: string,
  optIn: boolean,
  changedAt: Date,
) {
  await db
    .update(authUser)
    .set({ productUpdatesOptIn: optIn, productUpdatesChangedAt: changedAt })
    .where(eq(authUser.id, userId));
}

export const AuthRepository = {
  upsertDelegatedOrganization,
  ensureOrganization,
  upsertMember,
  findFirstOrganizationIdForUser,
  findFirstFoundedOrganizationIdForUser,
  findNewestMembershipForUser,
  getMembership,
  getMemberInOrganization,
  transferOwnership,
  listMembershipsForUser,
  getLastActiveOrganizationId,
  setLastActiveOrganization,
  setTermsAcceptance,
  setProductUpdatesOptIn,
  getHostedUser,
  getHostedUserNames,
  getOrganizationOwner,
  hasPendingInvitationForEmail,
  isAnalyticsOptedOut,
} as const;
