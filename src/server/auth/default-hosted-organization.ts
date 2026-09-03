import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { markDubReferredOrganization } from "@/server/referrals/dub";
import { slugify, toHex } from "./org-slug";

type HostedUser = {
  id: string;
  email: string;
  name?: string | null;
};

type HostedOrganizationCreateInput = {
  name: string;
  slug: string;
  userId: string;
};

type HostedOrganizationCreator = (
  input: HostedOrganizationCreateInput,
) => Promise<{ id: string }>;

function getDefaultHostedOrganizationName(user: HostedUser) {
  const name = user.name?.trim() || user.email.split("@")[0] || "OpenSEO";
  return `${name}'s organization`;
}

function getDefaultHostedOrganizationSlug(user: HostedUser) {
  const slugSource =
    user.name?.trim() || user.email.split("@")[0] || "organization";
  const suffix = toHex(user.id).slice(0, 12);
  return `${slugify(slugSource)}-${suffix}`;
}

async function getHostedUser(userId: string) {
  const hostedUser = await AuthRepository.getHostedUser(userId);

  if (!hostedUser?.email) {
    throw new Error("Failed to resolve hosted user for session setup");
  }

  return hostedUser;
}

async function createDefaultHostedOrganization(
  user: HostedUser,
  createOrganization: HostedOrganizationCreator,
) {
  try {
    const createdOrganization = await createOrganization({
      name: getDefaultHostedOrganizationName(user),
      slug: getDefaultHostedOrganizationSlug(user),
      userId: user.id,
    });

    return createdOrganization.id;
  } catch (error) {
    const organizationId = await AuthRepository.findFirstOrganizationIdForUser(
      user.id,
    );

    if (organizationId) {
      return organizationId;
    }

    throw error;
  }
}

type ActiveHostedOrganization = {
  organizationId: string;
  role: string;
};

async function findExistingActiveOrganization(
  userId: string,
): Promise<ActiveHostedOrganization | null> {
  const lastActiveOrganizationId =
    await AuthRepository.getLastActiveOrganizationId(userId);

  if (lastActiveOrganizationId) {
    const membership = await AuthRepository.getMembership(
      userId,
      lastActiveOrganizationId,
    );

    if (membership) {
      return {
        organizationId: lastActiveOrganizationId,
        role: membership.role,
      };
    }
  }

  const newestMembership =
    await AuthRepository.findNewestMembershipForUser(userId);

  if (newestMembership) {
    return {
      organizationId: newestMembership.organizationId,
      role: newestMembership.role,
    };
  }

  return null;
}

async function createActiveHostedOrganization(
  userId: string,
  createOrganization: HostedOrganizationCreator,
): Promise<ActiveHostedOrganization> {
  const hostedUser = await getHostedUser(userId);
  const organizationId = await createDefaultHostedOrganization(
    hostedUser,
    createOrganization,
  );

  // Read the role instead of asserting "owner": a create that lost a race
  // falls back to whatever membership won, which may not be owner-created.
  const membership = await AuthRepository.getMembership(userId, organizationId);
  return { organizationId, role: membership?.role ?? "owner" };
}

// On every resolution, not just org creation: the signup-time referral pin
// can land after the org exists (email verification from another location,
// or BYPASS_EMAIL_VERIFICATION creating the session inside the signup
// transaction before user.create.after hooks flush), so later logins repair
// the org pin. No-ops without a user pin, and only ever pins an org the user
// founded — an invitee's membership never counts.
async function repairDubReferralPin(userId: string) {
  await markDubReferredOrganization(userId);
}

// Picks the org a hosted user should be working in: their last-active org if
// they still belong to it, else their most recently joined org (so a fresh
// invite acceptance beats the signup-minted personal organization), else a
// newly created default organization. Used by the stale-session fallback in
// resolveHostedContext.
export async function resolveActiveHostedOrganization(
  userId: string,
  createOrganization: HostedOrganizationCreator,
): Promise<ActiveHostedOrganization> {
  const existing = await findExistingActiveOrganization(userId);
  if (existing) {
    await repairDubReferralPin(userId);
    return existing;
  }
  const created = await createActiveHostedOrganization(
    userId,
    createOrganization,
  );
  await repairDubReferralPin(userId);
  return created;
}

// Same as resolveActiveHostedOrganization, but never mints a default
// organization. Used by API-key authentication: a user with no memberships has
// no org to bill or authorize, so credentials should be rejected instead of
// silently spinning up a new workspace.
export async function resolveExistingActiveHostedOrganization(
  userId: string,
): Promise<ActiveHostedOrganization | null> {
  const existing = await findExistingActiveOrganization(userId);
  if (!existing) {
    return null;
  }
  await repairDubReferralPin(userId);
  return existing;
}

// Sign-in (session-create hook) variant: same resolution, except a user with
// no memberships and a pending invitation gets NO auto-minted personal
// organization — someone who signs up from an invite link should end up in
// exactly the inviter's org, not that plus an empty personal one. Returns
// null in that window (the session carries no active org until they accept).
// Abandoning the invite flow self-heals: the next app request goes through
// resolveActiveHostedOrganization, which still creates a default organization.
export async function resolveSignInHostedOrganization(
  userId: string,
  createOrganization: HostedOrganizationCreator,
): Promise<ActiveHostedOrganization | null> {
  const existing = await findExistingActiveOrganization(userId);
  if (existing) {
    await repairDubReferralPin(userId);
    return existing;
  }

  const hostedUser = await getHostedUser(userId);
  if (await AuthRepository.hasPendingInvitationForEmail(hostedUser.email)) {
    return null;
  }

  const created = await createActiveHostedOrganization(
    userId,
    createOrganization,
  );
  await repairDubReferralPin(userId);
  return created;
}
