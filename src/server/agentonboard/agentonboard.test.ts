import { beforeEach, describe, expect, it, vi } from "vitest";

const { isHostedAuthModeMock, optionalEnvMock, requiredEnvMock } = vi.hoisted(
  () => ({
    isHostedAuthModeMock: vi.fn(),
    optionalEnvMock: vi.fn<(name: string) => Promise<string | undefined>>(),
    requiredEnvMock: vi.fn<(name: string) => Promise<string>>(),
  }),
);

vi.mock("@/lib/auth-mode", () => ({
  isHostedAuthMode: isHostedAuthModeMock,
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: optionalEnvMock,
  getRequiredEnvValue: requiredEnvMock,
}));

const { dbQueryUserMock } = vi.hoisted(() => ({
  dbQueryUserMock: { findFirst: vi.fn() },
}));

// The real @/db barrel and @/db/schema both drag in cloudflare:workers
// (db/provider.ts), which is unavailable in the Vitest node environment —
// stub both so importing them here does not touch the DB client.
vi.mock("@/db", () => ({ db: { query: { user: dbQueryUserMock } } }));

// The production file imports `user` from @/db/schema for the eq() lookup;
// the real schema module also loads cloudflare:workers. Provide a stub symbol
// so the import resolves without loading the schema.
vi.mock("@/db/schema", () => ({ user: Symbol("user") }));

const { getOrCreateDefaultHostedOrganizationMock } = vi.hoisted(() => ({
  getOrCreateDefaultHostedOrganizationMock: vi.fn(),
}));

vi.mock("@/server/auth/default-hosted-organization", () => ({
  getOrCreateDefaultHostedOrganization:
    getOrCreateDefaultHostedOrganizationMock,
}));

import {
  isAgentOnboardConfigured,
  resolveAgentContext,
  verifySessionToken,
} from "@/server/agentonboard/agentonboard";

const USER = {
  id: "user-1",
  email: "agent@openseo.test",
  emailVerified: true,
};

function makeHeaders(sessionToken?: string) {
  const headers = new Headers();
  if (sessionToken) {
    headers.set("x-session-token", sessionToken);
  }
  return headers;
}

function mockVerifyOk(email = USER.email) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ email }, { status: 200 })),
  );
}

function mockVerifyError(status: number, error: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error }, { status })),
  );
}

beforeEach(() => {
  isHostedAuthModeMock.mockReturnValue(true);
  optionalEnvMock.mockImplementation(async (name) =>
    name === "AGENTONBOARD_PARTNER_KEY" ? "partner-key" : undefined,
  );
  requiredEnvMock.mockResolvedValue("partner-key");
  getOrCreateDefaultHostedOrganizationMock.mockResolvedValue("org-1");
  vi.unstubAllGlobals();
});

describe("isAgentOnboardConfigured", () => {
  it("is true when hosted and a partner key is configured", async () => {
    await expect(isAgentOnboardConfigured()).resolves.toBe(true);
  });

  it("is false when not hosted", async () => {
    isHostedAuthModeMock.mockReturnValue(false);
    await expect(isAgentOnboardConfigured()).resolves.toBe(false);
  });

  it("is false when no partner key is configured", async () => {
    optionalEnvMock.mockImplementation(async () => undefined);
    await expect(isAgentOnboardConfigured()).resolves.toBe(false);
  });
});

describe("verifySessionToken", () => {
  it("returns the email for a valid token", async () => {
    mockVerifyOk();
    await expect(verifySessionToken("good-token")).resolves.toEqual({
      ok: true,
      email: USER.email,
    });
  });

  it("returns an error result for an invalid or expired token", async () => {
    mockVerifyError(401, "Invalid or expired session token");
    const result = await verifySessionToken("bad-token");
    expect(result).toEqual({
      ok: false,
      code: "invalid_session",
      error: "Invalid or expired session token",
    });
  });

  it("classifies a revoked partner key as revoked_key", async () => {
    mockVerifyError(403, "Partner key has been revoked");
    const result = await verifySessionToken("good-token");
    expect(result).toEqual({
      ok: false,
      code: "revoked_key",
      error: "Partner key has been revoked",
    });
  });

  it("classifies an AgentOnboard 500 as upstream", async () => {
    mockVerifyError(500, "Internal server error");
    const result = await verifySessionToken("good-token");
    expect(result).toEqual({
      ok: false,
      code: "upstream",
      error: "Internal server error",
    });
  });

  it("returns an error result when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const result = await verifySessionToken("good-token");
    expect(result).toEqual({
      ok: false,
      code: "upstream",
      error: "Network error: cannot reach AgentOnboard",
    });
  });
});

describe("resolveAgentContext", () => {
  it("returns null when not configured", async () => {
    optionalEnvMock.mockImplementation(async () => undefined);
    await expect(resolveAgentContext(makeHeaders("t"))).resolves.toBeNull();
  });

  it("returns null when no session token header is present", async () => {
    await expect(resolveAgentContext(makeHeaders())).resolves.toBeNull();
  });

  it("throws UNAUTHENTICATED when verification fails", async () => {
    mockVerifyError(401, "Invalid or expired session token");
    await expect(
      resolveAgentContext(makeHeaders("bad-token")),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("throws UPSTREAM_UNAVAILABLE when the partner key is revoked", async () => {
    mockVerifyError(403, "Partner key has been revoked");
    await expect(
      resolveAgentContext(makeHeaders("good-token")),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("throws UPSTREAM_UNAVAILABLE on an AgentOnboard upstream failure", async () => {
    mockVerifyError(500, "Internal server error");
    await expect(
      resolveAgentContext(makeHeaders("good-token")),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("throws UPSTREAM_UNAVAILABLE when the AgentOnboard API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      resolveAgentContext(makeHeaders("good-token")),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("throws UNAUTHENTICATED with a create-account message when the email has no account", async () => {
    mockVerifyOk();
    dbQueryUserMock.findFirst.mockResolvedValue(undefined);
    await expect(
      resolveAgentContext(makeHeaders("good-token")),
    ).rejects.toThrow("No account exists with this email");
  });

  it("throws UNAUTHENTICATED when the matched user's email is unverified", async () => {
    mockVerifyOk();
    dbQueryUserMock.findFirst.mockResolvedValue({
      ...USER,
      emailVerified: false,
    });
    await expect(
      resolveAgentContext(makeHeaders("good-token")),
    ).rejects.toThrow("email on this OpenSEO account is not verified");
  });

  it("resolves the user's own organization and returns the context", async () => {
    mockVerifyOk();
    dbQueryUserMock.findFirst.mockResolvedValue(USER);
    const context = await resolveAgentContext(makeHeaders("good-token"));
    expect(getOrCreateDefaultHostedOrganizationMock).toHaveBeenCalledWith(
      USER.id,
      expect.any(Function),
    );
    expect(context).toEqual({
      userId: USER.id,
      userEmail: USER.email,
      emailVerified: true,
      organizationId: "org-1",
    });
  });
});
