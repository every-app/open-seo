import { getAuth, hasHostedAuthConfig } from "@/lib/auth";
import { getOrCreateDefaultHostedOrganization } from "@/server/auth/default-hosted-organization";
import { AppError } from "@/server/lib/errors";
import type { EnsuredUserContext } from "./types";

function getActiveOrganizationId(session: { session: unknown }) {
  if (!session.session || typeof session.session !== "object") {
    return null;
  }

  const { activeOrganizationId } = session.session as {
    activeOrganizationId?: unknown;
  };

  return typeof activeOrganizationId === "string" ? activeOrganizationId : null;
}

async function requireHostedSession(headers: Headers) {
  if (!hasHostedAuthConfig()) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Missing Better Auth hosted configuration",
    );
  }

  const session = await getAuth().api.getSession({ headers });

  if (!session?.user?.id || !session.user.email) {
    throw new AppError("UNAUTHENTICATED");
  }

  return session;
}

export async function resolveHostedContext(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const session = await requireHostedSession(headers);
  const activeOrganizationId = getActiveOrganizationId(session);

  if (activeOrganizationId) {
    return {
      userId: session.user.id,
      userEmail: session.user.email,
      organizationId: activeOrganizationId,
    };
  }

  const authApi = getAuth().api;
  const organizationId = await getOrCreateDefaultHostedOrganization(
    session.user.id,
    (body) => authApi.createOrganization({ body }),
  );

  await authApi.setActiveOrganization({
    headers,
    body: { organizationId },
  });

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    organizationId,
  };
}
