import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import { deriveIndexNowKey } from "@/server/lib/indexnow";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

const indexNowBodySchema = z.object({
  host: z.string(),
  key: z.string(),
  keyLocation: z.string(),
  urlList: z.array(z.string()),
});

describe("IndexNow MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the deterministic key + verification file location", async () => {
    const { getIndexNowKeyTool } = await import("./indexnow-tools");
    const expectedKey = await deriveIndexNowKey("project_1");

    const result = await getIndexNowKeyTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(expectedKey).toMatch(/^[0-9a-f]{32}$/);
    expect(result.structuredContent).toMatchObject({
      host: "acme.com",
      key: expectedKey,
      keyFileContent: expectedKey,
      keyLocation: `https://acme.com/${expectedKey}.txt`,
    });
  });

  it("errors when the project has no domain", async () => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      name: "Acme",
      domain: null,
      locationCode: 2840,
      languageCode: "en",
    });
    const { getIndexNowKeyTool } = await import("./indexnow-tools");

    await expect(
      getIndexNowKeyTool.handler({ projectId: "project_1" }, toolExtra),
    ).rejects.toThrow(/domain/i);
  });

  it("submits on-host URLs and skips cross-host ones", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    const fetchMock = vi.fn((input: unknown, init?: { body?: unknown }) => {
      capturedUrl = typeof input === "string" ? input : undefined;
      capturedBody = typeof init?.body === "string" ? init.body : undefined;
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { submitUrlsIndexNowTool } = await import("./indexnow-tools");
    const expectedKey = await deriveIndexNowKey("project_1");

    const result = await submitUrlsIndexNowTool.handler(
      {
        projectId: "project_1",
        urls: [
          "https://acme.com/a",
          "https://acme.com/b",
          "https://other.com/c",
        ],
      },
      toolExtra,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toBe("https://api.indexnow.org/indexnow");
    const body = indexNowBodySchema.parse(JSON.parse(capturedBody ?? "{}"));
    expect(body.host).toBe("acme.com");
    expect(body.urlList).toEqual(["https://acme.com/a", "https://acme.com/b"]);
    expect(body.key).toBe(expectedKey);
    expect(body.keyLocation).toBe(`https://acme.com/${expectedKey}.txt`);

    expect(result.structuredContent).toMatchObject({
      host: "acme.com",
      submitted: 2,
      skipped: ["https://other.com/c"],
      status: 200,
      ok: true,
    });
  });

  it("errors when no submitted URL is on the project host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { submitUrlsIndexNowTool } = await import("./indexnow-tools");

    await expect(
      submitUrlsIndexNowTool.handler(
        { projectId: "project_1", urls: ["https://elsewhere.com/x"] },
        toolExtra,
      ),
    ).rejects.toThrow(/acme\.com/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
