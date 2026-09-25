import { env } from "cloudflare:workers";
import { getAuth } from "@/lib/auth";
import {
  DGTL_SSO_PROVIDER_ID,
  getDgtlSsoProviderConfig,
  checkDgtlSeoAccess,
} from "@/lib/dgtl-sso";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { AppError } from "@/server/lib/errors";

/** Recheck central entitlement even when a linked user signs in locally. */
export async function requireDgtlSeoAccess(userId: string): Promise<void> {
  const provider = getDgtlSsoProviderConfig(env);
  if (!provider) return;
  const accounts = await AuthRepository.getDgtlAccount(userId);
  if (!accounts.length && env.DGTL_SSO_REQUIRED !== "true") return;
  if (!accounts.length) throw new AppError("DGTL_LINK_REQUIRED");
  if (accounts.length !== 1) {
    console.warn("DGTL access check: multiple_linked_identities");
    throw new AppError("FORBIDDEN");
  }
  let accessToken: string | undefined;
  try {
    // Better Auth decrypts stored tokens and refreshes expired OAuth tokens.
    const tokens = await getAuth().api.getAccessToken({
      body: {
        providerId: DGTL_SSO_PROVIDER_ID,
        userId,
        accountId: accounts[0].accountId,
      },
    });
    accessToken = tokens.accessToken;
  } catch {
    console.warn("DGTL access check: token renewal required");
    throw new AppError("DGTL_REAUTH_REQUIRED");
  }
  if (!accessToken) throw new AppError("DGTL_REAUTH_REQUIRED");
  const access = await checkDgtlSeoAccess(
    env.DGTL_SSO_ACCESS_CHECK_URL!.trim(),
    accessToken,
    accounts[0].accountId,
  );
  if (access === "reauth") throw new AppError("DGTL_REAUTH_REQUIRED");
  if (access === "unavailable") throw new AppError("UPSTREAM_UNAVAILABLE");
  if (access === "denied") throw new AppError("FORBIDDEN");
}
