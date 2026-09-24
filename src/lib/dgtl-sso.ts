import { z } from "zod";

export const DGTL_SSO_PROVIDER_ID = "dgtl-sso";

const userInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.literal(true),
  name: z.string().nullable().optional(),
  picture: z.string().url().nullable().optional(),
});

const accessSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["invited", "active", "suspended"]),
  services: z.array(z.object({ key: z.string() })),
});

type DgtlSsoEnv = {
  AUTH_MODE?: string;
  DGTL_SSO_ENABLED?: string;
  DGTL_SSO_REQUIRED?: string;
  DGTL_SSO_DISCOVERY_URL?: string;
  DGTL_SSO_CLIENT_ID?: string;
  DGTL_SSO_CLIENT_SECRET?: string;
  DGTL_SSO_ACCESS_CHECK_URL?: string;
};

export function getDgtlSsoProviderConfig(env: DgtlSsoEnv) {
  if (
    env.AUTH_MODE === "hosted" &&
    env.DGTL_SSO_REQUIRED === "true" &&
    env.DGTL_SSO_ENABLED !== "true"
  ) {
    throw new Error("DGTL_SSO_REQUIRED requires DGTL_SSO_ENABLED");
  }
  if (env.AUTH_MODE !== "hosted" || env.DGTL_SSO_ENABLED !== "true") {
    return null;
  }

  const discoveryUrl = env.DGTL_SSO_DISCOVERY_URL?.trim();
  const clientId = env.DGTL_SSO_CLIENT_ID?.trim();
  const clientSecret = env.DGTL_SSO_CLIENT_SECRET?.trim();
  const accessCheckUrl = env.DGTL_SSO_ACCESS_CHECK_URL?.trim();

  if (!discoveryUrl || !clientId || !clientSecret || !accessCheckUrl) {
    throw new Error(
      "DGTL SSO requires DGTL_SSO_DISCOVERY_URL, DGTL_SSO_CLIENT_ID, DGTL_SSO_CLIENT_SECRET, and DGTL_SSO_ACCESS_CHECK_URL",
    );
  }

  const url = new URL(discoveryUrl);
  const accessUrl = new URL(accessCheckUrl);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && url.hostname === "localhost")) ||
    !url.pathname.endsWith("/.well-known/openid-configuration")
  ) {
    throw new Error(
      "DGTL_SSO_DISCOVERY_URL must be an HTTPS OIDC discovery URL (or localhost for development)",
    );
  }
  if (
    (accessUrl.protocol !== "https:" &&
      !(
        accessUrl.protocol === "http:" && accessUrl.hostname === "localhost"
      )) ||
    !accessUrl.pathname.endsWith("/v1/me")
  ) {
    throw new Error(
      "DGTL_SSO_ACCESS_CHECK_URL must be an HTTPS /v1/me URL (or localhost for development)",
    );
  }

  // Better Auth 1.6.22's default Generic OAuth profile path decodes an ID
  // token without validating its signature. Query the trusted Supabase
  // UserInfo endpoint with the exchanged access token instead.
  const userInfoUrl = new URL(url);
  userInfoUrl.pathname = url.pathname.replace(
    "/.well-known/openid-configuration",
    "/oauth/userinfo",
  );

  return {
    providerId: DGTL_SSO_PROVIDER_ID,
    discoveryUrl: url.toString(),
    clientId,
    clientSecret,
    // Match the confidential Supabase client's client_secret_basic setting.
    authentication: "basic" as const,
    scopes: ["openid", "email", "profile"],
    pkce: true,
    getUserInfo: async (tokens: { accessToken?: string }) => {
      if (!tokens.accessToken) return null;
      const response = await fetch(userInfoUrl.toString(), {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return null;
      const parsed = userInfoSchema.safeParse(await response.json());
      if (!parsed.success) return null;
      const { sub, email, name, picture } = parsed.data;
      if (
        !(await hasDgtlSeoAccess(accessUrl.toString(), tokens.accessToken, sub))
      ) {
        return null;
      }
      return {
        id: sub,
        email,
        emailVerified: true,
        name: name?.trim() || email,
        image: picture ?? undefined,
      };
    },
    // Only identities with verified central SEO access reach user creation.
    // Existing verified local emails may match through Better Auth's linking
    // policy; unverified local accounts still need explicit recovery.
    disableSignUp: false,
  };
}

export async function hasDgtlSeoAccess(
  url: string,
  token: string,
  subject: string,
): Promise<boolean> {
  return (await checkDgtlSeoAccess(url, token, subject)) === "allowed";
}

/** Log only fixed reason codes, never tokens, identities, or response bodies. */
export async function checkDgtlSeoAccess(
  url: string,
  token: string,
  subject: string,
): Promise<"allowed" | "reauth" | "denied" | "unavailable"> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.warn("DGTL access check: network_failure");
    return "unavailable";
  }
  if (!response.ok) {
    console.warn(`DGTL access check: http_${response.status}`);
    if (response.status === 401) return "reauth";
    return response.status === 403 ? "denied" : "unavailable";
  }
  const access = accessSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!access.success) {
    console.warn("DGTL access check: invalid_profile_response");
    return "unavailable";
  }
  const reason =
    access.data.id !== subject
      ? "identity_mismatch"
      : access.data.status !== "active"
        ? "inactive_account"
        : !access.data.services.some((service) => service.key === "seo")
          ? "seo_not_assigned"
          : null;
  if (reason) {
    console.warn(`DGTL access check: ${reason}`);
    return "denied";
  }
  return "allowed";
}
