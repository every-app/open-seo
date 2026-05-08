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
        },
        body: JSON.stringify({ grant_type: "authorization_code" }),
      }),
    ];

    for (const request of requests) {
      await expect(maybeInjectMcpResource(request)).resolves.toBe(request);
    }
  });
});
