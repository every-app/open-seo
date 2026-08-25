import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { slugify, toHex } from "./org-slug";

// Every Cloudflare Access user on a deployment shares this one workspace. The
// id deliberately lacks the "delegated-" prefix so the legacy per-user pattern
// below can be matched (and merged) without excluding it.
export const SHARED_WORKSPACE_ORGANIZATION_ID = "shared-workspace";

export async function ensureSharedWorkspaceOrganization() {
  await AuthRepository.upsertDelegatedOrganization({
    id: SHARED_WORKSPACE_ORGANIZATION_ID,
    name: "Shared workspace",
    slug: SHARED_WORKSPACE_ORGANIZATION_ID,
  });

  return SHARED_WORKSPACE_ORGANIZATION_ID;
}

function getDelegatedOrganizationId(userId: string) {
  return `delegated-${userId}`;
}

function getDelegatedOrganizationName(email: string, userId: string) {
  return `${email.split("@")[0] || userId} workspace`;
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
