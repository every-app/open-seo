import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError } from "@/server/lib/errors";
import { resolveDelegatedContext } from "./delegated";
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
  const normalizedTeamDomain = teamDomain.trim().replace(/\/+$/, "");

  try {
    const parsed = new URL(normalizedTeamDomain);

    if (parsed.protocol !== "https:") {
      throw new Error("TEAM_DOMAIN must use https");
    }

    return parsed.origin;
  } catch {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "TEAM_DOMAIN must be a full https URL like https://your-team.cloudflareaccess.com",
    );
  }
}

export async function resolveCloudflareAccessContext(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const teamDomain = env.TEAM_DOMAIN
    ? getValidatedTeamDomain(env.TEAM_DOMAIN)
    : null;
  const policyAud = env.POLICY_AUD?.trim() || null;

  if (!teamDomain || !policyAud) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Missing Cloudflare Access configuration",
    );
  }

  const token = headers.get("cf-access-jwt-assertion");

  if (!token) {
    throw new AppError("UNAUTHENTICATED");
  }

  try {
    const jwks = getJwks(teamDomain);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: teamDomain,
      audience: policyAud,
    });
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const userEmail = typeof payload.email === "string" ? payload.email : null;

    if (!userId || !userEmail) {
      throw new AppError("UNAUTHENTICATED");
    }

    return resolveDelegatedContext(userId, userEmail);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("UNAUTHENTICATED");
  }
}
