import { describe, expect, it } from "vitest";

import {
  createMcpToolContext,
  createWorkersOAuthMcpProps,
} from "@/server/mcp/context";

const applicationContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  baseUrl: "https://open-seo.test",
};

describe("OpenSEO tool auth context", () => {
  it("prefers standard OAuth client metadata over the props fallback", () => {
    const props = createWorkersOAuthMcpProps({
      ...applicationContext,
      role: "admin",
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
      role: "admin",
      clientId: "client-1",
      scopes: ["mcp"],
    });
  });

  it("reads clientId and scopes from props when authInfo is absent", () => {
    const props = createWorkersOAuthMcpProps({
      ...applicationContext,
      role: "owner",
      clientId: "legacy-client",
      scopes: ["mcp"],
    });

    expect(createMcpToolContext({}, props).auth).toMatchObject({
      ...applicationContext,
      clientId: "legacy-client",
      scopes: ["mcp"],
    });
  });

  // The hosted transport stamps the role from the member row on every
  // request; hosted props without one skipped that check.
  it("fails closed when hosted props carry no role", () => {
    const props = createWorkersOAuthMcpProps({
      ...applicationContext,
      clientId: "api_key",
      scopes: ["mcp"],
    });

    expect(() => createMcpToolContext({}, props)).toThrow("missing a role");
  });

  it("defaults self-host props (no client identity) to the implicit owner", () => {
    const props = createWorkersOAuthMcpProps(applicationContext);

    expect(createMcpToolContext({}, props).auth).toMatchObject({
      role: "owner",
      clientId: null,
    });
  });
});
