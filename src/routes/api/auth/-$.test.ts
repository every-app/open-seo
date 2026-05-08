import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {
    AUTH_MODE: "hosted",
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (routeConfig: unknown) => routeConfig,
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ handler: vi.fn() }),
  getHostedBaseUrl: () => "https://open-seo.test",
  hasHostedAuthConfig: () => true,
}));

describe("maybeInjectMcpResource", () => {
  it("injects the MCP resource into form token requests when missing", async () => {
    const { maybeInjectMcpResource } = await import("@/routes/api/auth/$");
    const request = new Request("https://open-seo.test/api/auth/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "13",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "code_123",
      }),
    });

    const result = await maybeInjectMcpResource(request);
    const params = new URLSearchParams(await result.text());

    expect(params.get("resource")).toBe("https://open-seo.test/mcp");
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("code_123");
    expect(result.headers.has("content-length")).toBe(false);
  });

  it("leaves token requests alone when a resource is already present", async () => {
    const { maybeInjectMcpResource } = await import("@/routes/api/auth/$");
    const request = new Request("https://open-seo.test/api/auth/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        resource: "https://other-resource.test/mcp",
      }),
    });

    await expect(maybeInjectMcpResource(request)).resolves.toBe(request);
  });

  it("skips requests that are not matching form POST token requests", async () => {
    const { maybeInjectMcpResource } = await import("@/routes/api/auth/$");
    const requests = [
      new Request("https://open-seo.test/api/auth/oauth2/token", {
        method: "GET",
      }),
      new Request("https://open-seo.test/api/auth/oauth2/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "authorization_code" }),
      }),
      new Request("https://open-seo.test/api/auth/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "13",
        },
        body: JSON.stringify({ grant_type: "authorization_code" }),
      }),
    ];

    for (const request of requests) {
      await expect(maybeInjectMcpResource(request)).resolves.toBe(request);
    }
  });
});

describe("maybeDefaultMcpClientRegistrationAuthMethod", () => {
  it("defaults JSON dynamic client registration to a public client when omitted", async () => {
    const { maybeDefaultMcpClientRegistrationAuthMethod } =
      await import("@/routes/api/auth/$");
    const request = new Request(
      "https://open-seo.test/api/auth/oauth2/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Claude",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        }),
      },
    );

    const result = await maybeDefaultMcpClientRegistrationAuthMethod(request);
    const body = await result.json();

    expect(body).toMatchObject({
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
    });
    expect(result.headers.has("content-length")).toBe(false);
  });

  it("forces unauthenticated dynamic client registration to a public client", async () => {
    const { maybeDefaultMcpClientRegistrationAuthMethod } =
      await import("@/routes/api/auth/$");
    const request = new Request(
      "https://open-seo.test/api/auth/oauth2/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token_endpoint_auth_method: "client_secret_basic",
        }),
      },
    );

    const result = await maybeDefaultMcpClientRegistrationAuthMethod(request);
    const body = await result.json();

    expect(body).toMatchObject({
      token_endpoint_auth_method: "none",
    });
  });

  it("leaves explicit registration auth methods alone when auth context exists", async () => {
    const { maybeDefaultMcpClientRegistrationAuthMethod } =
      await import("@/routes/api/auth/$");
    const request = new Request(
      "https://open-seo.test/api/auth/oauth2/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "better-auth.session_token=session_123",
        },
        body: JSON.stringify({
          token_endpoint_auth_method: "client_secret_basic",
        }),
      },
    );

    await expect(
      maybeDefaultMcpClientRegistrationAuthMethod(request),
    ).resolves.toBe(request);
  });

  it("leaves malformed JSON registration requests for the auth handler", async () => {
    const { maybeDefaultMcpClientRegistrationAuthMethod } =
      await import("@/routes/api/auth/$");
    const request = new Request(
      "https://open-seo.test/api/auth/oauth2/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{",
      },
    );

    await expect(
      maybeDefaultMcpClientRegistrationAuthMethod(request),
    ).resolves.toBe(request);
  });
});
