import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { slugify, toHex } from "./org-slug";

// Every Cloudflare Access user on a deployment shares this one workspace. The
// id deliberately lacks the "delegated-" prefix so the legacy per-user pattern
// below can be matched (and merged) without excluding it.
export const SHARED_WORKSPACE_ORGANIZATION_ID = "shared-workspace";

export async function ensureSharedWorkspaceOrganization() {
  await AuthRepository.upsertDelegatedOrganization({
    id: SHARED_WORKSPACE_ORGANIZATION_ID,
    name: "Shared organization",
    slug: SHARED_WORKSPACE_ORGANIZATION_ID,
  });

  return SHARED_WORKSPACE_ORGANIZATION_ID;
}

function getDelegatedOrganizationId(userId: string) {
  return `delegated-${userId}`;
}

function getDelegatedOrganizationName(email: string, userId: string) {
  return `${email.split("@")[0] || userId} organization`;
}

function getDelegatedOrganizationSlug(email: string, userId: string) {
  const slugSource = email.split("@")[0] || userId;
  return `delegated-${slugify(slugSource)}-${toHex(userId)}`;
}

export async function ensureDelegatedOrganizationForUser(
  userId: string,
  email: string,
) {
  const organizationId = getDelegatedOrganizationId(userId);
  const name = getDelegatedOrganizationName(email, userId);
  const slug = getDelegatedOrganizationSlug(email, userId);

  await AuthRepository.upsertDelegatedOrganization({
    id: organizationId,
    name,
    slug,
  });

  return organizationId;
}

// AUTH_MODE=everyapp, first party (EVERY_APP_ORG_ID unset): each Every App
// organization is an OpenSEO organization with the same id, so its projects
// and everything under them are scoped exactly as hosted organizations are.
// The slug hex-encodes the id: gateway ids are mixed-case, and slugify alone
// would fold two of them into one slug.
function getEveryAppOrganizationSlug(organizationId: string) {
  return `everyapp-${toHex(organizationId)}`;
}

function getEveryAppOrganizationName(organizationId: string) {
  return `Organization ${organizationId.slice(0, 8)}`;
}

// What this isolate has already written, so a request makes no writes once
// its user, organization and role are known: membership → role. Values, not
// promises: Workers can't share a pending database call across requests. A
// role change at the gateway writes again, so the member row follows it.
const ensuredMemberships = new Map<string, string>();
const MAX_ENSURED_MEMBERSHIPS = 5_000;

export async function ensureEveryAppMembership(input: {
  organizationId: string;
  userId: string;
  role: string;
}) {
  const key = JSON.stringify([input.organizationId, input.userId]);
  if (ensuredMemberships.get(key) === input.role) return input.organizationId;

  await AuthRepository.ensureOrganization({
    id: input.organizationId,
    name: getEveryAppOrganizationName(input.organizationId),
    slug: getEveryAppOrganizationSlug(input.organizationId),
  });
  await AuthRepository.upsertMember(input);

  if (ensuredMemberships.size >= MAX_ENSURED_MEMBERSHIPS) {
    ensuredMemberships.clear();
  }
  ensuredMemberships.set(key, input.role);
  return input.organizationId;
}

/** For tests: forget what this isolate has written. */
export function resetEnsuredEveryAppMemberships() {
  ensuredMemberships.clear();
}
