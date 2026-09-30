import type * as Jose from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, jwtVerify, resolveSharedWorkspaceContext } = vi.hoisted(
  () => ({
    mockEnv: {} as Record<string, string | undefined>,
    jwtVerify: vi.fn(),
    resolveSharedWorkspaceContext: vi.fn(
      async (userId: string, userEmail: string) => ({
        userId,
        userEmail,
        emailVerified: true,
        organizationId: "org_shared",
        role: "owner" as const,
      }),
    ),
  }),
);

vi.mock("cloudflare:workers", () => ({ env: mockEnv }));
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof Jose>();
  return {
    ...actual,
    createRemoteJWKSet: () => ({}),
    jwtVerify: (...args: unknown[]) => jwtVerify(...args),
  };
});
vi.mock("./delegated", () => ({ resolveSharedWorkspaceContext }));

import { resolveCloudflareAccessContext } from "./cloudflareAccess";

function headersWith(token: string) {
  return new Headers({ "cf-access-jwt-assertion": token });
}

describe("resolveCloudflareAccessContext", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockEnv)) delete mockEnv[key];
    mockEnv.TEAM_DOMAIN = "https://martechs.cloudflareaccess.com";
    mockEnv.POLICY_AUD = "aud-123";
    jwtVerify.mockReset();
    resolveSharedWorkspaceContext.mockClear();
  });

  it("resolves a user identity token by sub and email", async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: "user-1", email: "uday@martechs.io" },
    });

    const context = await resolveCloudflareAccessContext(headersWith("jwt"));

    expect(context.userId).toBe("user-1");
    expect(resolveSharedWorkspaceContext).toHaveBeenCalledWith(
      "user-1",
      "uday@martechs.io",
    );
  });

  it("maps the configured service token to the shared workspace", async () => {
    mockEnv.MCP_SERVICE_TOKEN_CLIENT_ID = "abc123.access";
    mockEnv.MCP_SERVICE_TOKEN_EMAIL = "uday@martechs.io";
    jwtVerify.mockResolvedValue({
      payload: { sub: "", common_name: "abc123.access" },
    });

    const context = await resolveCloudflareAccessContext(headersWith("jwt"));

    expect(context.userId).toBe("service:abc123.access");
    expect(resolveSharedWorkspaceContext).toHaveBeenCalledWith(
      "service:abc123.access",
      "uday@martechs.io",
    );
  });

  it("rejects a service token that is not the configured one", async () => {
    mockEnv.MCP_SERVICE_TOKEN_CLIENT_ID = "abc123.access";
    mockEnv.MCP_SERVICE_TOKEN_EMAIL = "uday@martechs.io";
    jwtVerify.mockResolvedValue({
      payload: { sub: "", common_name: "other.access" },
    });

    await expect(
      resolveCloudflareAccessContext(headersWith("jwt")),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects any service token when none is configured", async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: "", common_name: "abc123.access" },
    });

    await expect(
      resolveCloudflareAccessContext(headersWith("jwt")),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
