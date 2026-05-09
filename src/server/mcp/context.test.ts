import { describe, expect, it } from "vitest";
import {
  createWorkersOAuthMcpProps,
  MCP_AUTH_CONTEXT_PROP,
  withWorkersOAuthMcpScopes,
  workersOAuthMcpPropsSchema,
} from "@/server/mcp/context";

const mcpContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["offline_access", "mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

describe("withWorkersOAuthMcpScopes", () => {
  it("stores the OpenSEO MCP context in Workers OAuth props", () => {
    const props = createWorkersOAuthMcpProps(mcpContext);

    expect(workersOAuthMcpPropsSchema.parse(props)).toEqual({
      [MCP_AUTH_CONTEXT_PROP]: mcpContext,
    });
  });

  it("updates access-token props with downscoped token scopes", () => {
    const props = createWorkersOAuthMcpProps(mcpContext);

    expect(withWorkersOAuthMcpScopes(props, ["mcp"])).toEqual({
      [MCP_AUTH_CONTEXT_PROP]: {
        ...mcpContext,
        scopes: ["mcp"],
      },
    });
  });

  it("leaves unrecognized provider props alone", () => {
    expect(withWorkersOAuthMcpScopes({}, ["mcp"])).toBeUndefined();
  });
});
