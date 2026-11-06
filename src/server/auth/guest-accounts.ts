import { env } from "cloudflare:workers";
import { z } from "zod";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { getHostedTurnstileSecretKey } from "@/lib/auth-turnstile";
import { guestEmail } from "@/shared/guest-account";
import { requestPrivacyChoices } from "@/shared/privacy-choices";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { GuestAccountRepository } from "@/server/auth/repositories/GuestAccountRepository";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { toHex } from "@/server/auth/org-slug";
import {
  agentFromRedirectUri,
  readClaimCookie,
  readCookie,
  RETURNING_BROWSER_COOKIE,
} from "@/server/auth/guest-cookies";
import { autumn } from "@/server/billing/autumn";
import { FeatureFlag, isFeatureFlagOn } from "@/server/lib/featureFlags";

// Someone connecting an AI agent over MCP without an OpenSEO session gets a
// guest account instead of a sign-up form: a user with a placeholder email and
// its own organization, which starts on the free plan like any new account.
// The connect page leaves a claim cookie in the browser, and the next sign-up
// or sign-in there hands the guest's organization (projects, remaining
// credits) and the agent's connection to the real account.

const MAX_GUESTS_PER_IP = 2;

// Networks of the large cloud and hosting providers (AWS, Google Cloud, Azure,
// Oracle, DigitalOcean, Hetzner, OVH, Linode, Vultr, Contabo, Scaleway,
// Alibaba, Tencent). A person connecting their AI app does so from a home,
// office or phone network, so a guest request from one of these is almost
// certainly a script. It still gets the normal sign-in page.
const CLOUD_HOSTING_ASNS = new Set([
  16509, 14618, 15169, 396982, 8075, 31898, 14061, 24940, 16276, 63949, 20473,
  51167, 12876, 45102, 132203,
]);

type GuestEligibility =
  | { eligible: true; ipHash: string; slot: number; agent: string | null }
  | { eligible: false; reason: string };

const AI_APP_HOSTS = new Set(["claude.ai", "claude.com", "chatgpt.com"]);

// A guest is approved without a click, so the authorization code must go
// somewhere a third party can't collect it: a known AI chat app, or the
// person's own computer (a CLI's loopback address or a desktop app's own URL
// scheme). Otherwise any site could bounce its visitors through our authorize
// URL and harvest a free account from each one.
function sendsCodeToAgent(redirectUri: string) {
  const url = URL.parse(redirectUri);
  if (!url) return false;
  if (url.protocol === "https:") return AI_APP_HOSTS.has(url.hostname);
  if (url.protocol === "http:") {
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  }
  return true;
}

/**
 * Whether this authorize request may get a guest account: hosted only, not
 * while the kill switch is on, only for an AI app's redirect, not from a cloud
 * network, not from a browser that has signed in before, and at most two per
 * IP ever.
 */
export async function checkGuestEligibility(
  request: Request,
  redirectUri: string,
): Promise<GuestEligibility> {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return { eligible: false, reason: "not_hosted" };
  }
  if (!sendsCodeToAgent(redirectUri)) {
    return { eligible: false, reason: "redirect_uri" };
  }
  if (readCookie(request.headers, RETURNING_BROWSER_COOKIE)) {
    return { eligible: false, reason: "returning_browser" };
  }
  if (await isFeatureFlagOn(FeatureFlag.PauseMcpGuestAccounts)) {
    return { eligible: false, reason: "paused" };
  }
  const ip =
    request.headers.get("cf-connecting-ip") ??
    (process.env.NODE_ENV === "production" ? null : "127.0.0.1");
  if (!ip) return { eligible: false, reason: "no_ip" };
  const asn = request.cf?.asn;
  if (typeof asn === "number" && CLOUD_HOSTING_ASNS.has(asn)) {
    return { eligible: false, reason: "cloud_network" };
  }
  const ipHash = await hashIp(limitKey(ip));
  // Guests are never deleted, so an IP's slots run 0, 1, ... and the next free
  // one is the count. The unique (ip_hash, slot) index refuses a concurrent
  // request that read the same count.
  const slot = await GuestAccountRepository.countForIpHash(ipHash);
  if (slot >= MAX_GUESTS_PER_IP) {
    return { eligible: false, reason: "ip_limit" };
  }
  return {
    eligible: true,
    ipHash,
    slot,
    agent: agentFromRedirectUri(redirectUri),
  };
}

// One home connection on IPv6 gets a whole /64 and can pick any address in
// it, so the limit counts the /64. IPv4 counts the address.
function limitKey(ip: string) {
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [
        ...headGroups,
        ...Array<string>(8 - headGroups.length - tailGroups.length).fill("0"),
        ...tailGroups,
      ]
    : headGroups;
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

// Keyed so the stored value can't be reversed by hashing every IPv4 address.
async function hashIp(ip: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`guest-ip:${ip}`),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const siteverifySchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
});

/** Checks a Turnstile token. Passes when no secret is configured (local dev),
 *  the same rule the sign-up form's captcha follows. */
export async function verifyGuestTurnstile(
  token: string | undefined,
  request: Request,
) {
  const secret = getHostedTurnstileSecretKey(env);
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, signal: AbortSignal.timeout(5_000) },
    );
    const result = siteverifySchema.safeParse(await response.json());
    return (
      result.success &&
      result.data.success &&
      result.data.hostname === new URL(request.url).hostname
    );
  } catch (error) {
    console.error("guest.turnstile verification failed", error);
    return false;
  }
}

// createOrganization is injected (Better Auth's endpoint) so this module
// needn't import auth.ts, which imports it back for the sign-in claim.
// Returns null when a concurrent request from the same IP took the slot.
export async function createGuestAccount(
  request: Request,
  {
    ipHash,
    slot,
    agent,
  }: { ipHash: string; slot: number; agent: string | null },
  createOrganization: (body: {
    name: string;
    slug: string;
    userId: string;
  }) => Promise<{ id: string } | null>,
) {
  const userId = crypto.randomUUID().replaceAll("-", "");
  const claimToken = randomToken();
  const userEmail = guestEmail(userId);
  const created = await GuestAccountRepository.createGuestUser({
    userId,
    email: userEmail,
    ipHash,
    slot,
    agent,
    claimToken,
    // The analytics choice that applies to this browser, as at sign-up.
    analyticsOptedOut: !requestPrivacyChoices(request).analytics,
  });
  if (!created) return null;
  const organization = await createOrganization({
    name: "My organization",
    slug: `org-${toHex(userId)}`,
    userId,
  });
  if (!organization) throw new Error("Failed to create guest organization");
  return { userId, userEmail, organizationId: organization.id, claimToken };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * Hands the guest's organization, and with it the agent's connection, to
 * `userId`. Someone with no workspace of their own opens the guest's next; an
 * existing account stays in its own workspace, which holds its plan.
 */
async function claimGuestAccount(claimToken: string, userId: string) {
  const guest = await GuestAccountRepository.findUnclaimedGuest(claimToken);
  if (!guest || guest.userId === userId) return;
  const hadWorkspace = await GuestAccountRepository.hasMembership(userId);
  await GuestAccountRepository.transferToUser(guest.userId, userId);
  // The guest's agent already set up this organization, and the guest's own
  // onboarding answers went with it. Without this a new account lands in the
  // wizard, which edits the agent's project and can start a paid audit.
  await ActivationRepository.markOnboardingCompleted(
    userId,
    guest.organizationId,
  );
  if (!hadWorkspace) {
    await AuthRepository.setLastActiveOrganization(
      userId,
      guest.organizationId,
    );
  }
  // The billing customer was created with the guest's placeholder email, so
  // receipts for the credits they buy next would go nowhere.
  const owner = await AuthRepository.getOrganizationOwner(guest.organizationId);
  if (owner) {
    await autumn.customers
      .update({ customerId: guest.organizationId, email: owner.email })
      .catch((error: unknown) =>
        console.error("guest.claim billing email update failed", error),
      );
  }
}

/** Runs at every sign-in: a browser where an agent connected as a guest hands
 *  that guest to the account signing in. */
export async function claimGuestFromCookie(
  headers: Headers | undefined,
  userId: string,
) {
  const claimToken = readClaimCookie(headers);
  if (!claimToken) return;
  // Never let a failed claim block the sign-in itself; the cookie stays, so
  // the next sign-in tries again.
  await claimGuestAccount(claimToken, userId).catch((error: unknown) =>
    console.error("guest.claim at sign-in failed", error),
  );
}
