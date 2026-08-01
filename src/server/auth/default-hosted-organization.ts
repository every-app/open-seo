import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
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
  return `${name}'s workspace`;
}

function getDefaultHostedOrganizationSlug(user: HostedUser) {
  const slugSource =
    user.name?.trim() || user.email.split("@")[0] || "workspace";
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

export async function getOrCreateDefaultHostedOrganization(
  userId: string,
  createOrganization: HostedOrganizationCreator,
) {
  const existingOrganizationId =
    await AuthRepository.findFirstOrganizationIdForUser(userId);

  if (existingOrganizationId) {
    return existingOrganizationId;
  }

  const hostedUser = await getHostedUser(userId);
  return createDefaultHostedOrganization(hostedUser, createOrganization);
}
