import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { createOpenSeoOAuthProvider } from "./oauth-provider";

// End-to-end OAuth lifecycle against the REAL @cloudflare/workers-oauth-provider
// (only the Workers runtime shims and app session resolution are mocked),
// shaped after how Codex actually behaves: DCR with no token_endpoint_auth_method,
// PKCE S256, form-encoded token requests, and refresh with client_id only —
// no client secret, no scope parameter. Refresh breakage has bitten real
// clients before (PR #420); these tests pin the full register → authorize →
// consent → token → use → refresh → rotate chain.

const BASE = "https://app.openseo.so";
const MCP_RESOURCE = `${BASE}/mcp`;

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => void promise,
  // The provider imports WorkerEntrypoint for its class-based apiHandler
  // support; this suite uses object handlers, so a bare stand-in suffices.
  // oxlint-disable-next-line typescript/no-extraneous-class
  WorkerEntrypoint: class {},
}));

vi.mock("@/lib/auth", () => ({
  getHostedBaseUrl: () => "https://app.openseo.so",
}));

vi.mock("@/middleware/ensure-user/hosted", () => ({
  resolveHostedContext: () =>
    Promise.resolve({
      userId: "user-1",
      userEmail: "user@example.com",
      organizationId: "org-1",
    }),
}));

vi.mock("@/server/features/activation/mcpActivation", () => ({
  recordMcpAuthorized: () => Promise.resolve(),
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: () => Promise.resolve(),
}));

// The API side of the provider: echo the decrypted grant props back so tests
// can assert what a tool call would actually see after each token exchange.
vi.mock("@/server/mcp/transport", () => ({
  handleAuthenticatedOpenSeoMcpRequest: (
    _request: Request,
    props: unknown,
  ): Promise<Response> => Promise.resolve(Response.json({ props })),
}));

// Minimal in-memory KVNamespace honoring expirationTtl against Date.now(), so
// vi.setSystemTime drives token/grant expiry.
function createKvFake() {
  const store = new Map<
    string,
    { value: string; metadata?: unknown; expiresAt?: number }
  >();
  const live = (key: string) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    get(key: string, type?: unknown) {
      const entry = live(key);
      if (!entry) return Promise.resolve(null);
      const wantsJson =
        type === "json" ||
        (typeof type === "object" &&
          type !== null &&
          (type as { type?: string }).type === "json");
      return Promise.resolve(wantsJson ? JSON.parse(entry.value) : entry.value);
    },
    put(
      key: string,
      value: string,
      options?: { expirationTtl?: number; metadata?: unknown },
    ) {
      store.set(key, {
        value,
        metadata: options?.metadata,
        expiresAt:
          options?.expirationTtl !== undefined
            ? Date.now() + options.expirationTtl * 1000
            : undefined,
      });
      return Promise.resolve();
    },
    delete(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
    list(options?: { prefix?: string; cursor?: string; limit?: number }) {
      const keys = [...store.keys()]
        .filter((key) => live(key))
        .filter((key) => !options?.prefix || key.startsWith(options.prefix))
        .slice(0, options?.limit ?? 1000)
        .map((name) => {
          const entry = store.get(name);
          return {
            name,
            metadata: entry?.metadata,
            expiration: entry?.expiresAt
              ? Math.floor(entry.expiresAt / 1000)
              : undefined,
          };
        });
      return Promise.resolve({ keys, list_complete: true, cursor: "" });
    },
  };
}

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

type Provider = ReturnType<typeof createOpenSeoOAuthProvider>;
type Env = Parameters<Provider["fetch"]>[1];

let provider: Provider;
let env: Env;

beforeEach(async () => {
  vi.useRealTimers();
  const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
  provider = createOpenSeoOAuthProvider(() => new Response("app"));
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider touches only OAUTH_KV
  env = { OAUTH_KV: createKvFake() } as unknown as Env;
});

const registrationSchema = z.looseObject({
  client_id: z.string(),
  token_endpoint_auth_method: z.string(),
  client_secret: z.string().optional(),
});

const tokenResponseSchema = z.looseObject({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
});

const tokenErrorSchema = z.looseObject({
  error: z.string(),
});

const propsEchoSchema = z.object({
  props: z.object({
    openSeoAuth: z.looseObject({
      userId: z.string(),
      organizationId: z.string(),
      clientId: z.string(),
      scopes: z.array(z.string()),
    }),
  }),
});

function dispatch(request: Request) {
  return provider.fetch(request, env, ctx);
}

// Codex's DCR registration omits token_endpoint_auth_method entirely.
async function registerCodexStyleClient(
  overrides: Record<string, unknown> = {},
) {
  const response = await dispatch(
    new Request(`${BASE}/api/auth/oauth2/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Codex",
        redirect_uris: ["http://localhost:1455/auth/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        ...overrides,
      }),
    }),
  );
  expect(response.status).toBe(201);
  return registrationSchema.parse(await response.json());
}

async function authorizeAndGetCode(clientId: string, codeVerifier: string) {
  const challenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://localhost:1455/auth/callback",
    scope: "offline_access mcp",
    state: "state-1",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP_RESOURCE,
  });

  // The authorize route validates the request and bounces to the consent UI.
  const authorizeResponse = await dispatch(
    new Request(`${BASE}/api/auth/oauth2/authorize?${query.toString()}`),
  );
  expect(authorizeResponse.status).toBe(302);
  expect(authorizeResponse.headers.get("Location")).toContain("/oauth-consent");

  // The consent UI posts acceptance back with the original authorize query.
  const consentResponse = await dispatch(
    new Request(`${BASE}/api/oauth/consent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE,
      },
      body: JSON.stringify({ accept: true, query: query.toString() }),
    }),
  );
  expect(consentResponse.status).toBe(200);
  const { redirectTo } = z
    .object({ redirectTo: z.string() })
    .parse(await consentResponse.json());
  const code = new URL(redirectTo).searchParams.get("code");
  if (!code) throw new Error("authorization code missing from redirect");
  return code;
}

function tokenRequest(params: Record<string, string>) {
  return dispatch(
    new Request(`${BASE}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    }),
  );
}

async function exchangeCode(
  clientId: string,
  code: string,
  codeVerifier: string,
) {
  const response = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: "http://localhost:1455/auth/callback",
    client_id: clientId,
    code_verifier: codeVerifier,
    resource: MCP_RESOURCE,
  });
  expect(response.status).toBe(200);
  return tokenResponseSchema.parse(await response.json());
}

// Codex-shaped refresh: client_id only — no secret, no scope, no resource.
function refresh(clientId: string, refreshToken: string) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
}

async function callMcp(accessToken: string) {
  const response = await dispatch(
    new Request(MCP_RESOURCE, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
  expect(response.status).toBe(200);
  return propsEchoSchema.parse(await response.json()).props.openSeoAuth;
}

async function setupSession() {
  const client = await registerCodexStyleClient();
  const codeVerifier = randomBytes(32).toString("base64url");
  const code = await authorizeAndGetCode(client.client_id, codeVerifier);
  const tokens = await exchangeCode(client.client_id, code, codeVerifier);
  return { client, tokens };
}

describe("Codex-style OAuth token refresh (real workers-oauth-provider)", () => {
  it("registers a secretless client as public and completes the code exchange", async () => {
    const { client, tokens } = await setupSession();

    expect(client.token_endpoint_auth_method).toBe("none");
    const auth = await callMcp(tokens.access_token);
    expect(auth).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      clientId: client.client_id,
    });
    expect(auth.scopes).toContain("mcp");
  });

  it("refreshes with client_id only and the new token still carries the mcp scope", async () => {
    const { client, tokens } = await setupSession();

    const response = await refresh(client.client_id, tokens.refresh_token);
    expect(response.status).toBe(200);
    const refreshed = tokenResponseSchema.parse(await response.json());
    expect(refreshed.access_token).not.toBe(tokens.access_token);

    const auth = await callMcp(refreshed.access_token);
    expect(auth.scopes).toContain("mcp");
    expect(auth.clientId).toBe(client.client_id);

    // And the rotated refresh token keeps working for the next cycle.
    const second = await refresh(client.client_id, refreshed.refresh_token);
    expect(second.status).toBe(200);
  });

  it("honors the previous refresh token until the rotated one is used", async () => {
    // Codex can lose a token response (crash, retry): the provider keeps the
    // pre-rotation token valid until the new one is first used.
    const { client, tokens } = await setupSession();

    const first = tokenResponseSchema.parse(
      await (await refresh(client.client_id, tokens.refresh_token)).json(),
    );
    // Retry with the ORIGINAL token before ever using the rotated one.
    const retry = await refresh(client.client_id, tokens.refresh_token);
    expect(retry.status).toBe(200);

    const retried = tokenResponseSchema.parse(await retry.json());
    // Once a newer refresh token is used, the stale original is rejected.
    const afterUse = await refresh(client.client_id, retried.refresh_token);
    expect(afterUse.status).toBe(200);
    const stale = await refresh(client.client_id, tokens.refresh_token);
    expect(stale.status).toBe(400);
    expect(tokenErrorSchema.parse(await stale.json()).error).toBe(
      "invalid_grant",
    );
    void first;
  });

  it("accepts a refresh carrying the canonical RFC 8707 resource and rejects a mismatched one", async () => {
    const { client, tokens } = await setupSession();

    const exact = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
      resource: MCP_RESOURCE,
    });
    expect(exact.status).toBe(200);
    const rotated = tokenResponseSchema.parse(await exact.json());

    const mismatched = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: rotated.refresh_token,
      client_id: client.client_id,
      resource: `${BASE}/other`,
    });
    expect(mismatched.status).toBeGreaterThanOrEqual(400);
    expect(mismatched.status).toBeLessThan(500);
  });

  it("rejects an RFC 3986-equivalent resource variant (upstream #282 — flips when fixed)", async () => {
    // workers-oauth-provider compares resources with strict string equality,
    // so a trailing-slash variant of the canonical resource fails refresh with
    // invalid_target (cloudflare/workers-oauth-provider#282, open). Codex
    // omits the param entirely and never hits this; Cloudflare's MCP Server
    // Portal normalizes URLs this way and does. When upstream ships equivalence
    // matching, this test fails — flip the assertion to 200 and drop the note.
    const { client, tokens } = await setupSession();

    const slashVariant = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
      resource: `${MCP_RESOURCE}/`,
    });
    expect(slashVariant.status).toBe(400);
    expect(tokenErrorSchema.parse(await slashVariant.json()).error).toBe(
      "invalid_target",
    );
  });

  it("rejects a refresh that drops the mcp scope with a structured error", async () => {
    const { client, tokens } = await setupSession();

    const response = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
      scope: "offline_access",
    });
    expect(response.status).toBe(400);
    expect(tokenErrorSchema.parse(await response.json()).error).toBe(
      "invalid_scope",
    );
  });

  it("returns a structured error, never a 500, for a refresh at the end of the grant's life", async () => {
    // workers-oauth-provider < 0.8.1 crashed (uncaught 500) refreshing a grant
    // in its final minute because KV rejects sub-60s TTLs — a client that
    // retries a 500 and gives up looks exactly like "refresh is broken".
    const { client, tokens } = await setupSession();

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 30-day refresh TTL (MCP_REFRESH_TOKEN_TTL_SECONDS), 30s before the end.
      vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60 * 1000 - 30 * 1000);
      const response = await refresh(client.client_id, tokens.refresh_token);
      expect(response.status).toBeLessThan(500);
      if (response.status !== 200) {
        expect(
          tokenErrorSchema.parse(await response.json()).error,
        ).toBeTruthy();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("still rejects a secretless refresh from a client registered as confidential", async () => {
    // The pre-PR-#420 failure mode: a client stored with client_secret_basic
    // that never sends its secret fails refresh until it re-registers.
    const client = await registerCodexStyleClient({
      token_endpoint_auth_method: "client_secret_basic",
    });
    expect(client.client_secret).toBeTruthy();
    const codeVerifier = randomBytes(32).toString("base64url");
    const code = await authorizeAndGetCode(client.client_id, codeVerifier);

    // Confidential clients must authenticate even at the code exchange — and
    // since 0.9.0 the registered method is enforced: client_secret_basic means
    // the Authorization header, not a client_secret form field.
    const basicAuth = Buffer.from(
      `${client.client_id}:${client.client_secret ?? ""}`,
    ).toString("base64");
    const exchange = await dispatch(
      new Request(`${BASE}/api/auth/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "http://localhost:1455/auth/callback",
          code_verifier: codeVerifier,
        }).toString(),
      }),
    );
    expect(exchange.status).toBe(200);
    const tokens = tokenResponseSchema.parse(await exchange.json());

    const secretless = await refresh(client.client_id, tokens.refresh_token);
    expect(secretless.status).toBe(401);
    expect(tokenErrorSchema.parse(await secretless.json()).error).toBe(
      "invalid_client",
    );
  });
});
