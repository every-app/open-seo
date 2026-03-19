import { db } from "@/db";
import { organization } from "@/db/better-auth-schema";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "workspace";
}

function toHex(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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

  await db
    .insert(organization)
    .values({
      id: organizationId,
      name,
      slug,
      logo: null,
      createdAt: new Date(),
      metadata: null,
    })
    .onConflictDoUpdate({
      target: organization.id,
      set: {
        name,
        slug,
      },
    });

  return organizationId;
}
