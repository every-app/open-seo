import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { AppError } from "@/server/lib/errors";
import { validateTeamDomain } from "@/shared/selfhost-checks";
import { classifyAccessVerificationError } from "./accessTokenErrors";
import { resolveSharedWorkspaceContext } from "./delegated";
import type { EnsuredUserContext } from "./types";

const jwksByTeamDomain = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function getJwks(teamDomain: string) {
  const existing = jwksByTeamDomain.get(teamDomain);
  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(
    new URL(`${teamDomain}/cdn-cgi/access/certs`),
  );

  jwksByTeamDomain.set(teamDomain, jwks);

  return jwks;
}

function getValidatedTeamDomain(teamDomain: string) {
  const result = validateTeamDomain(teamDomain);

  if (!result.ok) {
    throw new AppError("AUTH_CONFIG_MISSING", result.message);
  }

  return result.origin;
}

export async function resolveCloudflareAccessContext(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const teamDomain = env.TEAM_DOMAIN
    ? getValidatedTeamDomain(env.TEAM_DOMAIN)
    : null;
  const policyAud = env.POLICY_AUD?.trim() || null;

  if (!teamDomain || !policyAud) {
    const missing = [
      teamDomain ? null : "TEAM_DOMAIN",
      policyAud ? null : "POLICY_AUD",
    ]
      .filter(Boolean)
      .join(" and ");
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Missing Cloudflare Access configuration: set ${missing} on the deployment. See docs/SELF_HOSTING_CLOUDFLARE.md.`,
    );
  }

  const token = headers.get("cf-access-jwt-assertion");

  if (!token) {
    // With Access enabled in front of the deployment, every request carries
    // this header — its absence means Access is not actually protecting the
    // route, which is a setup problem, not a signed-out user.
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "No Cloudflare Access token on the request. Cloudflare Access is not enabled in front of this deployment — add an Access application covering this hostname in Zero Trust, or set AUTH_MODE=local_noauth if you intend to run without auth on a private network.",
    );
  }

  // Only the token verification itself is classified — anything thrown past
  // this block (user resolution, DB access) is an app fault, and classifying
  // it here would mislabel a DB outage as an auth-config problem.
  let payload: JWTPayload;
  try {
    const jwks = getJwks(teamDomain);
    ({ payload } = await jwtVerify(token, jwks, {
      issuer: teamDomain,
      audience: policyAud,
    }));
  } catch (error) {
    // The classified AppError carries operator guidance; log the raw jose
    // error too, since it is the only place the underlying cause survives.
    console.error("Cloudflare Access token verification failed:", error);

    throw classifyAccessVerificationError(error);
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const userEmail = typeof payload.email === "string" ? payload.email : null;

  if (userId && userEmail) {
    return resolveSharedWorkspaceContext(userId, userEmail);
  }

  const serviceToken = resolveServiceTokenIdentity(
    payload,
    env.ACCESS_SERVICE_TOKEN_CLIENT_IDS,
  );
  if (serviceToken) {
    return resolveSharedWorkspaceContext(
      serviceToken.userId,
      serviceToken.userEmail,
    );
  }

  throw new AppError("UNAUTHENTICATED");
}

// A request authenticated with an Access service token (cron jobs, n8n,
// scripts) carries no user: `sub` is "" and there is no `email`, only the
// token's Client ID in `common_name`. Passing the Access policy is not enough
// on its own — the Client ID must also be listed in
// ACCESS_SERVICE_TOKEN_CLIENT_IDS, so adding a service token to a shared
// Access policy never silently grants OpenSEO access. Each listed token acts
// as its own user in the shared workspace.
function resolveServiceTokenIdentity(
  payload: JWTPayload,
  allowedClientIds: string | undefined,
): { userId: string; userEmail: string } | null {
  const clientId =
    typeof payload.common_name === "string" ? payload.common_name.trim() : "";
  if (!clientId) return null;

  const allowed = (allowedClientIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!allowed.includes(clientId)) return null;

  return {
    userId: `access-service-token:${clientId}`,
    // Placeholder address on the reserved .invalid TLD: the user table needs
    // an email, and this one can never be delivered to.
    userEmail: `${clientId}@service-token.invalid`,
  };
}
