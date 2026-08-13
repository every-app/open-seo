import { describe, expect, it } from "vitest";

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
    const props = createWorkersOAuthMcpProps({
      ...applicationContext,
      clientId: "stale-client",
      scopes: ["offline_access"],
    });

    expect(
      createMcpToolContext(
        {
          http: {
            authInfo: {
              token: "access-token",
              clientId: "client-1",
              scopes: ["mcp"],
            },
          },
        },
        props,
      ).auth,
    ).toMatchObject({
      ...applicationContext,
      clientId: "client-1",
      scopes: ["mcp"],
    });
  });

  it("reads clientId and scopes from props when authInfo is absent", () => {
    const props = createWorkersOAuthMcpProps({
      ...applicationContext,
      clientId: "legacy-client",
      scopes: ["mcp"],
    });

    expect(createMcpToolContext({}, props).auth).toMatchObject({
      ...applicationContext,
      clientId: "legacy-client",
      scopes: ["mcp"],
    });
  });
});
