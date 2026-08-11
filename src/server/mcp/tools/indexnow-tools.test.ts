import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { deriveIndexNowKey } from "@/server/lib/indexnow";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

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
      toolContext,
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
      getIndexNowKeyTool.handler({ projectId: "project_1" }, toolContext),
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
      toolContext,
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

  // Contract: a non-2xx from the IndexNow endpoint is reported as data
  // (ok:false + the status), NOT raised as a tool error. The submission was
  // well-formed; the engine simply rejected it — most often because the key
  // file isn't published yet (403), which the agent should be able to read and
  // act on rather than see as a tool failure. Engines also answer 202 for
  // "accepted, key validation pending", so ok tracks 2xx, not strictly 200.
  it.each([
    { status: 202, ok: true, label: "202 accepted / validation pending" },
    { status: 403, ok: false, label: "403 key not valid" },
    { status: 422, ok: false, label: "422 URLs do not belong to host" },
    { status: 500, ok: false, label: "500 engine error" },
  ])("reports HTTP $label as data, not a thrown error", async (scenario) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(null, { status: scenario.status })),
      ),
    );
    const { submitUrlsIndexNowTool } = await import("./indexnow-tools");

    const result = await submitUrlsIndexNowTool.handler(
      { projectId: "project_1", urls: ["https://acme.com/a"] },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      host: "acme.com",
      submitted: 1,
      status: scenario.status,
      ok: scenario.ok,
    });
    expect(result.isError).toBeFalsy();
  });

  it("errors when no submitted URL is on the project host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { submitUrlsIndexNowTool } = await import("./indexnow-tools");

    await expect(
      submitUrlsIndexNowTool.handler(
        { projectId: "project_1", urls: ["https://elsewhere.com/x"] },
        toolContext,
      ),
    ).rejects.toThrow(/acme\.com/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
