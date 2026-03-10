import { createMiddleware } from "@tanstack/react-start";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppError } from "@/server/lib/errors";
import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getRequest } from "@tanstack/react-start/server";

type AuthMode = "cloudflare_access" | "local_noauth";

const LOCAL_ADMIN_USER_ID = "local-admin";
const LOCAL_ADMIN_EMAIL = "admin@localhost";

const jwksByTeamDomain = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function getAuthMode(): AuthMode {
  const value = env.AUTH_MODE;

  if (value === "local_noauth" || value === "cloudflare_access") {
    return value;
  }

  if (value === "hosted") {
    throw new AppError(
      "INTERNAL_ERROR",
      "AUTH_MODE=hosted is not implemented yet",
    );
  }

  return "cloudflare_access";
}

function getJwks(teamDomain: string) {
  const existing = jwksByTeamDomain.get(teamDomain);
  if (existing) return existing;

  const jwks = createRemoteJWKSet(
    new URL(`${teamDomain}/cdn-cgi/access/certs`),
  );
  jwksByTeamDomain.set(teamDomain, jwks);
  return jwks;
}

function normalizeTeamDomain(teamDomain: string) {
  return teamDomain.trim().replace(/\/+$/, "");
}

function getValidatedTeamDomain(teamDomain: string) {
  const normalized = normalizeTeamDomain(teamDomain);

  try {
    const parsed = new URL(normalized);

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

async function ensureUserRecord(userId: string, userEmail: string) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!existingUser) {
    await db.insert(users).values({
      id: userId,
      email: userEmail,
    });

    return userEmail;
  }

  if (existingUser.email !== userEmail) {
    await db
      .update(users)
      .set({ email: userEmail })
      .where(eq(users.id, userId));
    return userEmail;
  }

  return existingUser.email;
}

export const ensureUserMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const authMode = getAuthMode();

  if (authMode === "local_noauth") {
    const userEmail = await ensureUserRecord(
      LOCAL_ADMIN_USER_ID,
      LOCAL_ADMIN_EMAIL,
    );

    return next({
      context: {
        userId: LOCAL_ADMIN_USER_ID,
        userEmail,
      },
    });
  }

  const request = getRequest();

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

  const token = request.headers.get("cf-access-jwt-assertion");

  if (!token) {
    throw new AppError("UNAUTHENTICATED");
  }

  let userId: string;
  let userEmail: string;

  try {
    const JWKS = getJwks(teamDomain);
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: teamDomain,
      audience: policyAud,
    });

    userId = typeof payload.sub === "string" ? payload.sub : "";
    userEmail = typeof payload.email === "string" ? payload.email : "";

    if (!userId || !userEmail) {
      throw new AppError("UNAUTHENTICATED");
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("UNAUTHENTICATED");
  }

  const ensuredEmail = await ensureUserRecord(userId, userEmail);

  return next({
    context: {
      userId,
      userEmail: ensuredEmail,
    },
  });
});
