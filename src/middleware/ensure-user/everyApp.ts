import { env } from "cloudflare:workers";
import {
  ConfigurationError,
  getEveryAppUser,
  type EveryAppUser,
} from "@every-app/sdk/server";
import { ensureSharedWorkspaceOrganization } from "@/server/auth/delegated-organization";
import { AppError } from "@/server/lib/errors";
import { ensureUserRecord } from "./delegated";
import type { EnsuredUserContext } from "./types";

// The gateway's organization roles are OpenSEO's: owners and admins manage
// projects and integrations, members research. Anything else gets the least.
const ROLES = new Set(["owner", "admin", "member"]);

// AUTH_MODE=everyapp: the Every App gateway signs in the person, checks they
// may open OpenSEO, and signs their identity onto every request it forwards.
// Like Cloudflare Access mode, everyone the gateway lets in works in one
// shared workspace; the install is pinned to its organization
// (EVERY_APP_ORG_ID) and a token for any other organization is refused.
// The role comes from the signed token on this request, never from a member
// row: when the gateway removes a member, it stops signing tokens for them
// and nothing in OpenSEO still lets them in.
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
        `${error.message} Deploy OpenSEO to the gateway with \`everyapp deploy\`, or run it locally with \`pnpm dev:everyapp\`.`,
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
  // The deploy pins the install to its organization (`everyapp dev` pins
  // nothing). The audience already names this app; this keeps another
  // organization's install of it out.
  const pinnedOrganizationId = env.EVERY_APP_ORG_ID;
  if (pinnedOrganizationId && user.orgId !== pinnedOrganizationId) {
    throw new AppError("UNAUTHENTICATED");
  }
  // The gateway always names an organization; a token without one has no
  // workspace to open.
  if (!user.orgId) throw new AppError("UNAUTHENTICATED");
  const role = ROLES.has(user.orgRole) ? user.orgRole : "member";
  const userEmail = await ensureUserRecord(user.id, user.email);
  const organizationId = await ensureSharedWorkspaceOrganization();
  return {
    userId: user.id,
    userEmail,
    emailVerified: true,
    organizationId,
    role,
  };
}
