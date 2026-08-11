import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
}));

vi.mock("agents/mcp/server", () => ({
  getMcpAuthContext: () => ({ props: mocks.props }),
}));

import {
  createMcpToolContext,
  createWorkersOAuthMcpProps,
  MCP_AUTH_CONTEXT_PROP,
  workersOAuthMcpPropsSchema,
} from "@/server/mcp/context";

const applicationContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  baseUrl: "https://open-seo.test",
};

describe("OpenSEO tool auth context", () => {
  it("stores only application-specific identity in Workers OAuth props", () => {
    const props = createWorkersOAuthMcpProps(applicationContext);

    expect(workersOAuthMcpPropsSchema.parse(props)).toEqual({
      [MCP_AUTH_CONTEXT_PROP]: applicationContext,
    });
  });

  it("rejects unrecognized provider props", () => {
    expect(workersOAuthMcpPropsSchema.safeParse({}).success).toBe(false);
  });

  it("prefers standard OAuth client metadata over the props fallback", () => {
    mocks.props = createWorkersOAuthMcpProps({
      ...applicationContext,
      clientId: "stale-client",
      scopes: ["offline_access"],
    });

    expect(
      createMcpToolContext({
        http: {
          authInfo: {
            token: "access-token",
            clientId: "client-1",
            scopes: ["mcp"],
          },
        },
      }).auth,
    ).toMatchObject({
      ...applicationContext,
      clientId: "client-1",
      scopes: ["mcp"],
    });
  });

  it("falls back to encrypted props with workers-oauth-provider 0.10", () => {
    mocks.props = createWorkersOAuthMcpProps({
      ...applicationContext,
      clientId: "client-1",
      scopes: ["mcp"],
    });

    expect(createMcpToolContext({}).auth).toMatchObject({
      ...applicationContext,
      clientId: "client-1",
      scopes: ["mcp"],
    });
  });
});
