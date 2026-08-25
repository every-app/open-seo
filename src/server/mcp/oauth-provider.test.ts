import {
  GrantType,
  type OAuthProviderOptions,
  type TokenExchangeCallbackOptions,
} from "@cloudflare/workers-oauth-provider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { createOpenSeoOAuthProvider } from "./oauth-provider";

const mocks = vi.hoisted(() => ({
  options: [] as OAuthProviderOptions<unknown>[],
  requests: [] as Request[],
  purges: [] as unknown[],
}));

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => void promise,
  // api-key-auth pulls the db client into this module graph; it reads env at
  // module load.
  env: {},
}));

// The whole module is doubled because the real one imports "cloudflare:workers"
// at top level, which vitest's node environment cannot load even via
// importOriginal. The error-class doubles must stay signature-compatible with
// the real AuthorizationError/OAuthError.
vi.mock("@cloudflare/workers-oauth-provider", () => {
  class AuthorizationError extends Error {
    readonly description: string;
    readonly redirectUri?: string;
    readonly state?: string;
    readonly issuer?: string;

    constructor(
      readonly code: string,
      options: {
        description: string;
        redirectUri?: string;
        state?: string;
        issuer?: string;
      },
    ) {
      super(options.description);
      this.description = options.description;
      this.redirectUri = options.redirectUri;
      this.state = options.state;
      this.issuer = options.issuer;
    }
  }

  class OAuthError extends Error {
    constructor(
      readonly code: string,
      options?: { description?: string },
    ) {
      super(options?.description);
    }
  }

  return {
    AuthorizationError,
    GrantType: { REFRESH_TOKEN: "refresh_token" },
    OAuthError,
    OAuthProvider: class {
      constructor(options: OAuthProviderOptions<unknown>) {
        mocks.options.push(options);
      }

      fetch(request: Request) {
        mocks.requests.push(request);
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      purgeExpiredData(env: unknown, options?: { batchSize?: number }) {
        mocks.purges.push({ env, options });
        return Promise.resolve({
          grantsChecked: 0,
          grantsPurged: 0,
          tokensChecked: 0,
          tokensPurged: 0,
          done: true,
        });
      }
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getHostedBaseUrl: () => "https://app.openseo.so",
}));

vi.mock("@/middleware/ensure-user/hosted", () => ({
  resolveHostedContext: vi.fn(),
}));

vi.mock("@/server/features/activation/mcpActivation", () => ({
  recordMcpAuthorized: vi.fn(),
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("@/server/mcp/transport", () => ({
  handleAuthenticatedOpenSeoMcpRequest: vi.fn(),
}));

const executionContext = {
  props: {},
  waitUntil() {},
  passThroughOnException() {},
} as ExecutionContext;

async function dispatch(
  provider: ReturnType<typeof createOpenSeoOAuthProvider>,
  request: Request,
) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mocked provider does not read its KV-backed environment in these configuration tests
  return provider.fetch(request, {} as never, executionContext);
}

function tokenExchangeOptions(
  requestedScope: string[],
): TokenExchangeCallbackOptions {
  return {
    grantType: GrantType.REFRESH_TOKEN,
    clientId: "client-1",
    userId: "user-1",
    grantId: "grant-1",
    scope: ["offline_access", "mcp"],
    requestedScope,
    props: {
      openSeoAuth: {
        userId: "user-1",
        userEmail: "user@example.com",
        organizationId: "org-1",
        baseUrl: "https://app.openseo.so",
        clientId: "client-1",
        scopes: ["offline_access", "mcp"],
      },
    },
  };
}

async function invokeDefaultHandler(
  request: Request,
  env: Record<string, unknown>,
) {
  const defaultHandler = mocks.options[0]?.defaultHandler;
  if (
    !defaultHandler ||
    typeof defaultHandler !== "object" ||
    !("fetch" in defaultHandler) ||
    typeof defaultHandler.fetch !== "function"
  ) {
    throw new Error("Missing default handler");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Workers' handler type requires incoming-only CF metadata; this test Request never inspects request.cf
  const workerRequest = request as Request<
    unknown,
    IncomingRequestCfProperties
  >;
  const rawResponse: unknown = await defaultHandler.fetch(
    workerRequest,
    env,
    executionContext,
  );
  if (!(rawResponse instanceof Response)) {
    throw new Error("Default handler did not return a response");
  }
  return rawResponse;
}

describe("OpenSEO OAuth provider configuration", () => {
  beforeEach(() => {
    mocks.options.length = 0;
    mocks.requests.length = 0;
    mocks.purges.length = 0;
  });

  it("binds tokens and protected-resource metadata to the canonical MCP URL", async () => {
    const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
    const provider = createOpenSeoOAuthProvider(() => new Response("app"));

    await dispatch(provider, new Request("https://app.openseo.so/health"));

    expect(mocks.options).toHaveLength(1);
    expect(mocks.options[0]?.resourceMetadata).toEqual({
      resource: "https://app.openseo.so/mcp",
      scopes_supported: ["mcp"],
      resource_name: "OpenSEO MCP",
    });
    expect(mocks.options[0]?.scopesSupported).toEqual([
      "offline_access",
      "mcp",
    ]);
    expect(mocks.options[0]?.clientRegistrationTTL).toBe(60 * 60 * 24 * 365);
  });

  it("purges OAuth KV data without needing a prior request", async () => {
    const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
    const provider = createOpenSeoOAuthProvider(() => new Response("app"));

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mocked provider does not read its KV-backed environment
    const result = await provider.purgeExpiredData({} as never);

    expect(result.done).toBe(true);
    expect(mocks.purges).toHaveLength(1);
    // The lazily built provider still pins the hosted resource.
    expect(mocks.options[0]?.resourceMetadata).toMatchObject({
      resource: "https://app.openseo.so/mcp",
    });
  });

  it("rejects token exchanges that drop the required MCP scope", async () => {
    const { OAuthError } = await import("@cloudflare/workers-oauth-provider");
    const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
    const provider = createOpenSeoOAuthProvider(() => new Response("app"));

    await dispatch(provider, new Request("https://app.openseo.so/health"));

    const callback = mocks.options[0]?.tokenExchangeCallback;
    if (!callback) throw new Error("Missing token exchange callback");
    expect(() =>
      callback(tokenExchangeOptions(["offline_access"])),
    ).toThrowError(OAuthError);
    expect(callback(tokenExchangeOptions(["mcp"]))).toEqual({
      accessTokenProps: {
        openSeoAuth: {
          userId: "user-1",
          userEmail: "user@example.com",
          organizationId: "org-1",
          baseUrl: "https://app.openseo.so",
          clientId: "client-1",
          scopes: ["mcp"],
        },
      },
    });
  });

  it("lets the provider issue Perplexity a real client secret", async () => {
    const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
    const provider = createOpenSeoOAuthProvider(() => new Response("app"));

    await dispatch(
      provider,
      new Request("https://app.openseo.so/api/auth/oauth2/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Perplexity",
          redirect_uris: ["https://www.perplexity.ai/api/mcp/oauth/callback"],
        }),
      }),
    );

    await expect(mocks.requests[0]?.json()).resolves.toMatchObject({
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  it("includes the authorization-server issuer when consent is denied", async () => {
    const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
    const provider = createOpenSeoOAuthProvider(() => new Response("app"));
    await dispatch(provider, new Request("https://app.openseo.so/health"));

    const response = await invokeDefaultHandler(
      new Request("https://app.openseo.so/api/oauth/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.openseo.so",
        },
        body: JSON.stringify({ accept: false, query: "state=state-1" }),
      }),
      {
        OAUTH_PROVIDER: {
          parseAuthRequest: () =>
            Promise.resolve({
              clientId: "client-1",
              redirectUri: "https://client.example/callback",
              scope: ["mcp"],
              state: "state-1",
              issuer: "https://app.openseo.so",
            }),
        },
      },
    );

    const body = z
      .object({ redirectTo: z.string().url() })
      .parse(await response.json());
    expect(
      Object.fromEntries(new URL(body.redirectTo).searchParams),
    ).toMatchObject({
      error: "access_denied",
      state: "state-1",
      iss: "https://app.openseo.so",
    });
  });

  it("redirects safe authorization errors with state and issuer", async () => {
    const { AuthorizationError } =
      await import("@cloudflare/workers-oauth-provider");
    const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
    const provider = createOpenSeoOAuthProvider(() => new Response("app"));
    await dispatch(provider, new Request("https://app.openseo.so/health"));

    const response = await invokeDefaultHandler(
      new Request("https://app.openseo.so/api/auth/oauth2/authorize"),
      {
        OAUTH_PROVIDER: {
          parseAuthRequest: () =>
            Promise.reject(
              new AuthorizationError("invalid_scope", {
                description: "Unsupported scope",
                redirectUri: "https://client.example/callback",
                state: "state-1",
                issuer: "https://app.openseo.so",
              }),
            ),
        },
      },
    );

    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    if (!location) throw new Error("Missing OAuth redirect");
    expect(Object.fromEntries(new URL(location).searchParams)).toMatchObject({
      error: "invalid_scope",
      error_description: "Unsupported scope",
      state: "state-1",
      iss: "https://app.openseo.so",
    });
  });

  it("does not expose unexpected authorization failures as client errors", async () => {
    const { createOpenSeoOAuthProvider } = await import("./oauth-provider");
    const provider = createOpenSeoOAuthProvider(() => new Response("app"));
    await dispatch(provider, new Request("https://app.openseo.so/health"));

    await expect(
      invokeDefaultHandler(
        new Request("https://app.openseo.so/api/auth/oauth2/authorize"),
        {
          OAUTH_PROVIDER: {
            parseAuthRequest: () =>
              Promise.reject(new Error("internal storage detail")),
          },
        },
      ),
    ).rejects.toThrow("internal storage detail");
  });
});
