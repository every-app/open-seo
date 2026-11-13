import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAuthMiddleware } from "better-auth/api";
import { beforeEach, expect, it, vi } from "vitest";
import { isFeatureFlagOn } from "@/server/lib/featureFlags";
import {
  assertChatGptSignInOffered,
  assertChatGptSignUpEmailVerified,
  chatGptSignInPlugins,
} from "./chatgpt-sign-in";

vi.mock("@/server/lib/featureFlags", () => ({
  FeatureFlag: { ChatGptSignIn: "chatgpt-sign-in" },
  isFeatureFlagOn: vi.fn(),
}));

const CLIENT_ID = "oaiapp_test";
// FLAGS is bound in production only; tests that set it are "in production".
const env: {
  AUTH_MODE: string;
  OPENAI_SIWC_CLIENT_ID: string;
  FLAGS?: object;
} = { AUTH_MODE: "hosted", OPENAI_SIWC_CLIENT_ID: CLIENT_ID };
const openAi = await generateKeyPair("RS256");
const stranger = await generateKeyPair("RS256");
const jwks = { keys: [{ ...(await exportJWK(openAi.publicKey)), kid: "k1" }] };

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let idToken = "";
let tokenRequest: { authorization: string | null; body: URLSearchParams };

const auth = betterAuth({
  baseURL: "http://localhost",
  secret: "x".repeat(32),
  database: memoryAdapter(db),
  plugins: chatGptSignInPlugins({
    OPENAI_SIWC_CLIENT_ID: CLIENT_ID,
    OPENAI_SIWC_CLIENT_SECRET: "s3cret",
  }),
  hooks: {
    before: createAuthMiddleware((ctx) => assertChatGptSignInOffered(env, ctx)),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          assertChatGptSignUpEmailVerified(user, ctx?.path);
          return { data: user };
        },
      },
    },
  },
});

beforeEach(() => {
  delete env.FLAGS;
  vi.mocked(isFeatureFlagOn).mockResolvedValue(false);
  for (const table of ["user", "account", "session", "verification"]) {
    db[table] = [];
  }
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/jwks.json")) return Response.json(jwks);
      tokenRequest = {
        authorization: request.headers.get("authorization"),
        body: new URLSearchParams(await request.text()),
      };
      return Response.json({ id_token: idToken, token_type: "Bearer" });
    },
  );
});

/**
 * Runs one sign-in: starts it, has "OpenAI" answer with an ID token built
 * from the nonce the app sent, and returns where the callback redirects.
 */
async function signIn(
  claims: (nonce: string) => Record<string, unknown>,
  options: { issuer?: string; audience?: string; key?: CryptoKey } = {},
) {
  const started = await auth.handler(
    new Request("http://localhost/api/auth/sign-in/oauth2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "chatgpt", callbackURL: "/app" }),
    }),
  );
  if (!started.ok) throw new Error(`start refused: ${started.status}`);
  const { url } = await started.json<{ url: string }>();
  const authorization = new URL(url).searchParams;
  const nonce = authorization.get("nonce") ?? "";

  idToken = await new SignJWT({
    email: "ada@example.com",
    email_verified: true,
    name: "Ada",
    ...claims(nonce),
  })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(options.issuer ?? "https://auth.openai.com")
    .setAudience(options.audience ?? CLIENT_ID)
    .setSubject("openai-sub-1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(options.key ?? openAi.privateKey);

  const callback = await auth.handler(
    new Request(
      `http://localhost/api/auth/oauth2/callback/chatgpt?code=c&state=${authorization.get("state")}`,
      {
        headers: {
          cookie: started.headers
            .getSetCookie()
            .map((cookie) => cookie.split(";")[0])
            .join("; "),
        },
      },
    ),
  );
  const location = new URL(
    callback.headers.get("location") ?? "",
    "http://localhost",
  );
  return { authorization, location, status: callback.status };
}

it("is off without a client ID", () => {
  expect(chatGptSignInPlugins({ OPENAI_SIWC_CLIENT_SECRET: "s" })).toEqual([]);
});

it("signs a new user in from a verified ID token", async () => {
  const { authorization, location } = await signIn((nonce) => ({ nonce }));

  expect(location.pathname).toBe("/app");
  expect(db.user).toMatchObject([
    { email: "ada@example.com", emailVerified: true, name: "Ada" },
  ]);
  // No OpenAI token is kept.
  expect(db.account).toMatchObject([
    { providerId: "chatgpt", accountId: "openai-sub-1" },
  ]);
  expect(db.account[0].idToken ?? null).toBeNull();

  expect(authorization.get("scope")).toBe("openid profile email");
  expect(authorization.get("code_challenge_method")).toBe("S256");
  // A confidential client's secret goes in the Basic header only.
  expect(tokenRequest.authorization).toBe(
    `Basic ${btoa(`${CLIENT_ID}:s3cret`)}`,
  );
  expect(tokenRequest.body.has("client_secret")).toBe(false);
  expect(tokenRequest.body.get("client_id")).toBe(CLIENT_ID);
  expect(tokenRequest.body.get("code_verifier")).toBeTruthy();
});

it.each([
  ["nonce from another sign-in", () => ({ nonce: "replayed" }), {}],
  ["missing nonce", () => ({}), {}],
  ["other audience", (nonce: string) => ({ nonce }), { audience: "oaiapp_x" }],
  ["other issuer", (nonce: string) => ({ nonce }), { issuer: "https://evil" }],
  [
    "other signing key",
    (nonce: string) => ({ nonce }),
    { key: stranger.privateKey },
  ],
])("refuses an ID token with a %s", async (_name, claims, options) => {
  const { location } = await signIn(claims, options);

  expect(location.searchParams.get("error")).toBe(
    "oauth_code_verification_failed",
  );
  expect(db.user).toEqual([]);
});

it("creates no account for an email OpenAI has not verified", async () => {
  const { location } = await signIn((nonce) => ({
    nonce,
    email_verified: false,
  }));

  expect(location.searchParams.get("error")).toBe("email_not_verified");
  expect(db.user).toEqual([]);
});

it("links to an existing account with the same email only when OpenAI verified it", async () => {
  const existing = {
    id: "u1",
    email: "ada@example.com",
    emailVerified: true,
    name: "Ada",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  db.user.push({ ...existing });
  const unverified = await signIn((nonce) => ({
    nonce,
    email_verified: false,
  }));
  expect(unverified.location.searchParams.get("error")).toBe(
    "account_not_linked",
  );
  expect(db.account).toEqual([]);

  const verified = await signIn((nonce) => ({ nonce }));
  expect(verified.location.pathname).toBe("/app");
  expect(db.account).toMatchObject([{ userId: "u1", providerId: "chatgpt" }]);
});

it("takes no ChatGPT sign-in in production while the flag is off", async () => {
  env.FLAGS = {};
  await expect(signIn((nonce) => ({ nonce }))).rejects.toThrow(
    "start refused: 404",
  );

  // Turned off mid-flow: the sign-in that already started cannot finish.
  vi.mocked(isFeatureFlagOn).mockResolvedValueOnce(true);
  const inFlight = await signIn((nonce) => ({ nonce }));
  expect(inFlight.status).toBe(404);
  expect(db.user).toEqual([]);

  vi.mocked(isFeatureFlagOn).mockResolvedValue(true);
  const allowed = await signIn((nonce) => ({ nonce }));
  expect(allowed.location.pathname).toBe("/app");
});
