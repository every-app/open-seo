import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { slugify, toHex } from "./org-slug";

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
