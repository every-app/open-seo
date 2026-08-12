import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionTokenHeaderMock, resolveAgentContextMock } = vi.hoisted(
  () => ({
    getSessionTokenHeaderMock: vi.fn(),
    resolveAgentContextMock: vi.fn(),
  }),
);

vi.mock("@/server/agentonboard/agentonboard", () => ({
  getSessionTokenHeader: getSessionTokenHeaderMock,
  resolveAgentContext: resolveAgentContextMock,
}));

const { handleAuthenticatedOpenSeoMcpRequestMock } = vi.hoisted(() => ({
  handleAuthenticatedOpenSeoMcpRequestMock: vi.fn(),
}));

vi.mock("@/server/mcp/transport", () => ({
  handleAuthenticatedOpenSeoMcpRequest: handleAuthenticatedOpenSeoMcpRequestMock,
}));

import { handleAgentOnboardMcpRequest } from "@/server/agentonboard/agentonboard-mcp";
import { AppError } from "@/server/lib/errors";

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

function makeRequest(sessionToken?: string, method = "GET") {
  const headers = new Headers();
  if (sessionToken) {
    headers.set("x-session-token", sessionToken);
  }
  return new Request("https://openseo.so/mcp", { method, headers });
}

beforeEach(() => {
  getSessionTokenHeaderMock.mockReturnValue("x-session-token");
  resolveAgentContextMock.mockResolvedValue({
    userId: "user-1",
    userEmail: "agent@openseo.test",
    emailVerified: true,
    organizationId: "org-1",
  });
  handleAuthenticatedOpenSeoMcpRequestMock.mockImplementation(
    async (request, props, env, ctx) => new Response("mcp response", { status: 200 }),
  );
});

describe("handleAgentOnboardMcpRequest", () => {
  it("does not run for non-MCP routes", async () => {
    const req = new Request("https://openseo.so/other", { method: "GET" });
    await expect(
      handleAgentOnboardMcpRequest(req, {}, ctx),
    ).resolves.toBeNull();
  });

  it("returns null for OPTIONS preflight", async () => {
    await expect(
      handleAgentOnboardMcpRequest(makeRequest(undefined, "OPTIONS"), {}, ctx),
    ).resolves.toBeNull();
  });

  it("returns null when no session token is present", async () => {
    await expect(
      handleAgentOnboardMcpRequest(makeRequest(), {}, ctx),
    ).resolves.toBeNull();
  });

  it("serves the request through the hosted transport for a valid token", async () => {
    const result = await handleAgentOnboardMcpRequest(
      makeRequest("good-token"),
      {},
      ctx,
    );
    expect(handleAuthenticatedOpenSeoMcpRequestMock).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(await result?.text()).toBe("mcp response");
  });

  it("returns null when identity resolution yields nothing", async () => {
    resolveAgentContextMock.mockResolvedValue(null);
    await expect(
      handleAgentOnboardMcpRequest(makeRequest("token"), {}, ctx),
    ).resolves.toBeNull();
  });

  it("surfaces a rejected agent request as a JSON-RPC 401 error", async () => {
    const message =
      "No account exists with this email. Create an OpenSEO account with the same email you use on AgentOnboard, then try again.";
    resolveAgentContextMock.mockRejectedValue(
      new AppError("UNAUTHENTICATED", message),
    );
    const response = await handleAgentOnboardMcpRequest(
      makeRequest("good-token"),
      {},
      ctx,
    );
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.text()).toContain(message);
  });

  it("surfaces an internal failure as a JSON-RPC 500 error", async () => {
    resolveAgentContextMock.mockRejectedValue(new Error("boom"));
    const response = await handleAgentOnboardMcpRequest(
      makeRequest("good-token"),
      {},
      ctx,
    );
    expect(response?.status).toBe(500);
  });
});
