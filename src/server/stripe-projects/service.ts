import { generateRandomString } from "better-auth/crypto";
import { uniqueBy } from "remeda";
import { z } from "zod";
import { getAuth, getHostedBaseUrl } from "@/lib/auth";
import { resolveActiveHostedOrganization } from "@/server/auth/default-hosted-organization";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { sha256Hex } from "@/server/lib/audit/ids";
import { MCP_ROUTE } from "@/server/mcp/context";
import { loginLinkIdentifier, loginLinkSchema } from "./login-plugin";
import {
  StripeProjectsRepository,
  type StripeProjectsScope,
} from "./repository";

// Stripe Projects provider: `stripe projects add openseo/api` creates (or
// links) an OpenSEO account for the developer's Stripe-verified email and
// hands back an MCP API key. OpenSEO bills its own plans, so the catalog only
// lists the free service and paid plans stay on the billing page.

export const API_SERVICE_ID = "api";
const CODE_TTL_MS = 5 * 60 * 1000;
const LOGIN_LINK_TTL_MS = 10 * 60 * 1000;
// Stripe keeps the bearer in its vault and refreshes it; PostHog's provider
// uses the same one-year lifetime. Every resource call also needs Stripe's
// signature, so a leaked bearer alone can do nothing.
const ACCESS_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

export class StripeProjectsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// 256 random bits.
const randomToken = () => generateRandomString(43, "a-z", "A-Z", "0-9");

async function verification() {
  return (await getAuth().$context).internalAdapter;
}

// --- Account requests ---------------------------------------------------

const codeSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  stripeAccountId: z.string(),
  codeChallenge: z.string().nullable(),
});

const codeIdentifier = async (code: string) =>
  `stripe-projects-code:${await sha256Hex(code)}`;

// The same rule as Google sign-in: only an email the provider has verified,
// and never an OpenSEO account that hasn't confirmed its own address. Stripe's
// word is the only proof the requester owns the address, so without it a
// stranger could take a key to someone else's account, or pre-claim an
// address and keep a grant into it after the real owner arrives.
export async function linkAccount(input: {
  email: string;
  name?: string;
  emailVerified: boolean;
  stripeAccountId: string;
  codeChallenge?: string;
}) {
  if (!input.emailVerified) {
    throw new StripeProjectsError(
      "requires_kyc",
      "Stripe hasn't verified this email address. Verify it with Stripe, then try again.",
      403,
    );
  }

  const auth = getAuth();
  const { internalAdapter } = await auth.$context;
  const email = input.email.toLowerCase();
  const existing = await internalAdapter.findUserByEmail(email);
  if (existing && !existing.user.emailVerified) {
    throw new StripeProjectsError(
      "forbidden",
      `The OpenSEO account for this email hasn't confirmed its address. Sign in at ${getHostedBaseUrl()} to confirm it, then try again.`,
      403,
    );
  }
  const user =
    existing?.user ??
    (await internalAdapter
      .createUser({
        email,
        name: input.name?.trim() || email.split("@")[0] || "OpenSEO",
        emailVerified: true,
      })
      .catch((error: unknown) => {
        // The hosted user-create hook rejects disposable inboxes.
        throw new StripeProjectsError(
          "account_creation_failed",
          error instanceof Error ? error.message : "Could not create account",
        );
      }));

  const { organizationId } = await resolveActiveHostedOrganization(
    user.id,
    (body) => auth.api.createOrganization({ body }),
  );

  const code = randomToken();
  await internalAdapter.createVerificationValue({
    identifier: await codeIdentifier(code),
    value: JSON.stringify({
      userId: user.id,
      organizationId,
      stripeAccountId: input.stripeAccountId,
      codeChallenge: input.codeChallenge ?? null,
    } satisfies z.infer<typeof codeSchema>),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return { code };
}

// --- Token endpoint -------------------------------------------------------

export async function exchangeCode(input: {
  code: string;
  codeVerifier?: string;
  signed: boolean;
}) {
  const store = await verification();
  const identifier = await codeIdentifier(input.code);
  const pending = await store.findVerificationValue(identifier);
  if (!pending || pending.expiresAt < new Date()) throw invalidGrant();
  const { codeChallenge } = codeSchema.parse(JSON.parse(pending.value));

  // A code minted with a PKCE challenge is redeemed by its verifier; one
  // without needs Stripe's signature. Checked before consuming, so a failed
  // attempt does not burn a code Stripe can still redeem.
  if (codeChallenge) {
    if (!input.codeVerifier) {
      throw new StripeProjectsError(
        "invalid_request",
        "code_verifier is required for PKCE",
        401,
      );
    }
    if ((await pkceChallenge(input.codeVerifier)) !== codeChallenge) {
      throw invalidGrant();
    }
  } else if (!input.signed) {
    throw new StripeProjectsError(
      "invalid_request",
      "Authentication required",
      401,
    );
  }

  // Atomic, so two concurrent exchanges of one code can't both succeed.
  const consumed = await store.consumeVerificationValue(identifier);
  if (!consumed) throw invalidGrant();
  const scope = codeSchema.parse(JSON.parse(consumed.value));

  const tokens = await newTokenPair();
  await StripeProjectsRepository.insertGrant({
    id: crypto.randomUUID(),
    userId: scope.userId,
    organizationId: scope.organizationId,
    stripeAccountId: scope.stripeAccountId,
    ...tokens.hashes,
    createdAt: new Date().toISOString(),
  });

  return {
    ...tokens.response,
    account: {
      id: scope.organizationId,
      // OpenSEO bills its own plans; Stripe sends no payment tokens.
      payment_credentials: "provider",
    },
  };
}

export async function refreshTokens(refreshToken: string) {
  const tokens = await newTokenPair();
  const rotated = await StripeProjectsRepository.rotateGrantTokens(
    await sha256Hex(refreshToken),
    tokens.hashes,
  );
  if (!rotated) throw invalidGrant();
  return tokens.response;
}

async function newTokenPair() {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  return {
    hashes: {
      accessTokenHash: await sha256Hex(accessToken),
      refreshTokenHash: await sha256Hex(refreshToken),
      accessTokenExpiresAt: new Date(
        Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
    },
    response: {
      token_type: "bearer",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    },
  };
}

// PKCE S256: base64url(sha256(verifier)) without padding.
async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function invalidGrant() {
  return new StripeProjectsError(
    "invalid_grant",
    "The code or token is invalid, expired or already used",
  );
}

// Resolves the bearer on a resource call. The membership is re-read every
// time so removing someone from the organization cuts Stripe off too.
export async function authenticateBearer(
  accessToken: string,
): Promise<StripeProjectsScope | null> {
  const grant = await StripeProjectsRepository.findGrantByAccessToken(
    await sha256Hex(accessToken),
    new Date().toISOString(),
  );
  if (!grant) return null;
  const membership = await AuthRepository.getMembership(
    grant.userId,
    grant.organizationId,
  );
  return membership ? grant : null;
}

// --- Resources ------------------------------------------------------------

// Every provision is its own resource with its own key, so a second
// `stripe projects add` never touches the first one's key.
export async function provisionResource(
  scope: StripeProjectsScope,
  serviceId: string,
) {
  if (serviceId !== API_SERVICE_ID) {
    throw new StripeProjectsError(
      "unknown_service",
      `Unknown service: ${serviceId}`,
    );
  }
  const created = await createApiKey(scope);
  const id = crypto.randomUUID();
  await StripeProjectsRepository.insertResource({
    id,
    userId: scope.userId,
    organizationId: scope.organizationId,
    stripeAccountId: scope.stripeAccountId,
    apiKeyId: created.id,
    createdAt: new Date().toISOString(),
  });
  return { id, apiKey: created.key };
}

export async function requireResource(scope: StripeProjectsScope, id: string) {
  const resource = await StripeProjectsRepository.findResource(scope, id);
  if (!resource) throw resourceNotFound();
  return resource;
}

export async function rotateResourceCredentials(
  scope: StripeProjectsScope,
  id: string,
) {
  const resource = await requireResource(scope, id);
  // The replacement is minted before the old key is deleted, so a failure in
  // between never leaves the resource without a working key.
  const created = await createApiKey(scope);
  const swapped = await StripeProjectsRepository.setResourceApiKey(
    scope,
    id,
    created.id,
  );
  if (!swapped) {
    await StripeProjectsRepository.deleteApiKeys(scope.userId, [created.id]);
    throw resourceNotFound();
  }
  await StripeProjectsRepository.deleteApiKeys(scope.userId, [
    resource.apiKeyId,
  ]);
  return { id, apiKey: created.key };
}

// The account, its data and its credits stay: removing the resource only
// revokes the key Stripe handed out.
export async function removeResource(scope: StripeProjectsScope, id: string) {
  const apiKeyIds = await StripeProjectsRepository.deleteResources(scope, id);
  if (apiKeyIds.length === 0) throw resourceNotFound();
  await StripeProjectsRepository.deleteApiKeys(scope.userId, apiKeyIds);
}

function resourceNotFound() {
  return new StripeProjectsError("not_found", "Resource not found", 404);
}

// A server-side call: the before hook in lib/auth.ts lets it name the user
// and organization itself.
function createApiKey(scope: StripeProjectsScope) {
  return getAuth().api.createApiKey({
    body: {
      userId: scope.userId,
      name: "Stripe Projects",
      metadata: { organizationId: scope.organizationId },
    },
  });
}

export function getMcpUrl() {
  return `${getHostedBaseUrl()}${MCP_ROUTE}`;
}

// --- Settings → Connected agents -----------------------------------------

// One row per Stripe account linked to an organization. Stripe can link the
// same account again, which leaves several grants behind one row.
export async function listStripeConnections(userId: string) {
  return uniqueBy(
    await StripeProjectsRepository.listGrantsForUser(userId),
    (grant) => `${grant.organizationId}:${grant.stripeAccountId}`,
  );
}

// Deleting the grants stops Stripe minting new keys; removing the resources
// revokes the keys it already handed out. The developer can link again from
// their own Stripe CLI.
export async function disconnectStripeConnection(scope: StripeProjectsScope) {
  await StripeProjectsRepository.deleteGrants(scope);
  await StripeProjectsRepository.deleteApiKeys(
    scope.userId,
    await StripeProjectsRepository.deleteResources(scope),
  );
}

// --- Dashboard login links --------------------------------------------------

export async function createLoginLink(scope: StripeProjectsScope, path = "/") {
  if (!isSafeInAppPath(path)) {
    throw new StripeProjectsError(
      "invalid_path",
      "path must be an in-app path starting with a single '/'",
    );
  }
  const token = randomToken();
  const expiresAt = new Date(Date.now() + LOGIN_LINK_TTL_MS);
  await (
    await verification()
  ).createVerificationValue({
    identifier: await loginLinkIdentifier(token),
    value: JSON.stringify({
      userId: scope.userId,
      organizationId: scope.organizationId,
      path,
    } satisfies z.infer<typeof loginLinkSchema>),
    expiresAt,
  });
  const url = new URL("/stripe-projects/login", getHostedBaseUrl());
  url.searchParams.set("token", token);
  return { url: url.toString(), expiresAt: expiresAt.toISOString() };
}

// What the confirm page shows before the visitor signs in. Reading the link
// doesn't use it up, so a link preview or scanner can't burn it.
export async function getLoginLinkAccount(token: string) {
  const row = await (
    await verification()
  ).findVerificationValue(await loginLinkIdentifier(token));
  if (!row || row.expiresAt < new Date()) return null;
  const { userId } = loginLinkSchema.parse(JSON.parse(row.value));
  const user = await AuthRepository.getHostedUser(userId);
  return user ? { email: user.email } : null;
}

function isSafeInAppPath(path: string) {
  return (
    path.length <= 2000 &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    // Backslashes and control characters are how "/\evil.com" style paths
    // turn into off-site redirects.
    // oxlint-disable-next-line eslint/no-control-regex -- matching control characters is the point
    !/[\u0000- \u007f-\u009f\\]/.test(path)
  );
}
