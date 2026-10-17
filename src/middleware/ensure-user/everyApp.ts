import { env } from "cloudflare:workers";
import {
  ConfigurationError,
  getEveryAppUser,
  type EveryAppUser,
} from "@every-app/sdk/server";
import {
  ensureEveryAppMembership,
  ensureSharedWorkspaceOrganization,
} from "@/server/auth/delegated-organization";
import { AppError } from "@/server/lib/errors";
import { ensureUserRecord } from "./delegated";
import type { EnsuredUserContext } from "./types";

// The gateway's organization roles are OpenSEO's: owners and admins manage
// projects and integrations, members research. Anything else gets the least.
const ROLES = new Set(["owner", "admin", "member"]);

// AUTH_MODE=everyapp: the Every App gateway signs in the person, checks they
// may open OpenSEO, and signs their identity onto every request it forwards.
// Two shapes, one switch (docs/maintainers/every-app.md):
//
// - EVERY_APP_ORG_ID set (a fork, one organization's own copy): like
//   Cloudflare Access mode, everyone the gateway lets in works in one shared
//   workspace, and a token for any other organization is refused.
// - EVERY_APP_ORG_ID unset (first party, one Worker for every organization):
//   the token's organization is the OpenSEO organization, created on first
//   use with the same id, so each organization's projects stay its own.
//
// Either way the organization and role come from the signed token on this
// request, never from a member row: when the gateway removes a member, it
// stops signing tokens for them and nothing in OpenSEO still lets them in.
export async function resolveEveryAppContext(
  headers: Headers,
): Promise<EnsuredUserContext> {
  let user: EveryAppUser | null;
  try {
    // The SDK reads the identity headers only; the URL is never used.
    user = await getEveryAppUser(
      new Request("https://openseo.invalid/", { headers }),
      env,
    );
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw new AppError(
        "AUTH_CONFIG_MISSING",
        `${error.message} Deploy OpenSEO to the gateway with \`everyapp app deploy\`, or run it locally with \`pnpm dev:everyapp\`.`,
      );
    }
    console.error("Every App identity verification failed:", error);
    throw new AppError("UNAUTHENTICATED");
  }
  if (!user) throw new AppError("UNAUTHENTICATED");
  return resolveEveryAppUserContext(user);
}

/** The OpenSEO user and workspace for a verified gateway identity. */
export async function resolveEveryAppUserContext(
  user: EveryAppUser,
): Promise<EnsuredUserContext> {
  const pinnedOrganizationId = env.EVERY_APP_ORG_ID;
  // The deploy pins a fork to its organization. The audience already names
  // this app; this keeps another organization's install of it out.
  if (pinnedOrganizationId && user.orgId !== pinnedOrganizationId) {
    throw new AppError("UNAUTHENTICATED");
  }
  // The gateway always names an organization; a token without one has no
  // workspace to open.
  if (!user.orgId) throw new AppError("UNAUTHENTICATED");
  const role = ROLES.has(user.orgRole) ? user.orgRole : "member";
  const userEmail = await ensureUserRecord(user.id, user.email);
  const organizationId = pinnedOrganizationId
    ? await ensureSharedWorkspaceOrganization()
    : await ensureEveryAppMembership({
        organizationId: user.orgId,
        userId: user.id,
        role,
      });
  return {
    userId: user.id,
    userEmail,
    emailVerified: true,
    organizationId,
    role,
  };
}
