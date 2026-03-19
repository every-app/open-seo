import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, user as authUser } from "@/db/better-auth-schema";

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

function getDefaultHostedOrganizationName(user: HostedUser) {
  const name = user.name?.trim() || user.email.split("@")[0] || "OpenSEO";
  return `${name}'s workspace`;
}

function getDefaultHostedOrganizationSlug(user: HostedUser) {
  const slugSource =
    user.name?.trim() || user.email.split("@")[0] || "workspace";
  const suffix = toHex(user.id).slice(0, 12);
  return `${slugify(slugSource)}-${suffix}`;
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

async function getHostedUser(userId: string) {
  const hostedUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
    },
    where: eq(authUser.id, userId),
  });

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
    const organizationId = await findFirstOrganizationIdForUser(user.id);

    if (organizationId) {
      return organizationId;
    }

    throw error;
  }
}

export async function getOrCreateDefaultHostedOrganization(
  userId: string,
  createOrganization: HostedOrganizationCreator,
) {
  const existingOrganizationId = await findFirstOrganizationIdForUser(userId);

  if (existingOrganizationId) {
    return existingOrganizationId;
  }

  const hostedUser = await getHostedUser(userId);
  return createDefaultHostedOrganization(hostedUser, createOrganization);
}
