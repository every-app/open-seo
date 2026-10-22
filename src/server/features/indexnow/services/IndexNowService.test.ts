import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndexNowService } from "./IndexNowService";

const { getProject, setKey } = vi.hoisted(() => ({
  getProject: vi.fn(),
  setKey: vi.fn(),
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: getProject,
    setIndexNowKeyIfMissing: setKey,
  },
}));
// The SSRF guard resolves DNS; these tests only cover IndexNow behavior.
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: async (url: string) => url,
}));

const KEY = "abc123def456";
const scope = { projectId: "p1", organizationId: "o1" };
const fetchMock = vi.fn<typeof fetch>();

const ENGINES = ["www.bing.com", "yandex.com", "indexnow.yep.com"];
const engineOf = (input: Parameters<typeof fetch>[0]) => {
  const { hostname } = new URL(
    input instanceof Request ? input.url : input.toString(),
  );
  return ENGINES.includes(hostname) ? hostname : null;
};

// Key files answer with `keyFile`; engines answer in ENGINES order with
// `engines`, and with 200 past the end of the list.
function respond(keyFile: Response, ...engines: Response[]) {
  fetchMock.mockImplementation(async (input) => {
    const engine = engineOf(input);
    if (!engine) return keyFile.clone();
    return (
      engines[ENGINES.indexOf(engine)]?.clone() ??
      new Response(null, { status: 200 })
    );
  });
}

function submissions() {
  return fetchMock.mock.calls.flatMap(([input, init]) => {
    const engine = engineOf(input);
    if (!engine) return [];
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : null;
    return [{ engine, body }];
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getProject.mockResolvedValue({ domain: "example.com", indexnowKey: KEY });
  respond(new Response(KEY));
});

describe("IndexNowService.submitUrls", () => {
  it("submits one request per host on the project's website and skips the rest", async () => {
    const result = await IndexNowService.submitUrls(scope, [
      "https://example.com/a#section",
      "https://www.example.com/b",
      "https://example.com/a",
      "https://notexample.com/c",
      "not a url",
    ]);

    expect(submissions().map((submission) => submission.body)).toEqual([
      { host: "example.com", key: KEY, urlList: ["https://example.com/a"] },
      {
        host: "www.example.com",
        key: KEY,
        urlList: ["https://www.example.com/b"],
      },
    ]);
    expect(result.hosts.map((host) => host.status)).toEqual([
      "submitted",
      "submitted",
    ]);
    expect(result.skipped).toHaveLength(2);
  });

  it("creates the key on first use and returns the saved one", async () => {
    getProject.mockResolvedValueOnce({
      domain: "example.com",
      indexnowKey: null,
    });

    const result = await IndexNowService.submitUrls(scope, [
      "https://example.com/a",
    ]);

    expect(setKey).toHaveBeenCalledOnce();
    // The re-read wins, so a key saved by a parallel call is the one used.
    expect(result).toMatchObject({ key: KEY, keyCreated: true });
  });

  it("refuses a project without a website before creating a key", async () => {
    getProject.mockResolvedValue({ domain: null, indexnowKey: null });

    await expect(
      IndexNowService.submitUrls(scope, ["https://example.com/a"]),
    ).rejects.toThrow("Add the project's website");
    expect(setKey).not.toHaveBeenCalled();
  });

  it.each([
    ["is missing", new Response("Not found", { status: 404 })],
    ["holds a different page", new Response("<html>Home</html>")],
    [
      "redirects",
      new Response(null, {
        status: 301,
        headers: { location: "https://www.example.com/" },
      }),
    ],
    [
      "redirects to the same file on www",
      new Response(null, {
        status: 301,
        headers: { location: `https://www.example.com/${KEY}.txt` },
      }),
    ],
  ])("doesn't submit when the key file %s", async (_case, keyFile) => {
    respond(keyFile);

    const result = await IndexNowService.submitUrls(scope, [
      "https://example.com/a",
    ]);

    expect(submissions()).toEqual([]);
    expect(result.hosts[0]?.status).toBe("failed");
  });

  it("submits anyway when a bot wall hides the key file", async () => {
    respond(
      new Response("Forbidden", { status: 403 }),
      new Response(null, { status: 202 }),
    );

    const result = await IndexNowService.submitUrls(scope, [
      "https://example.com/a",
    ]);

    expect(submissions()).toHaveLength(1);
    expect(result.hosts[0]?.status).toBe("submitted");
  });

  it("moves on to the next engine when one rate-limits", async () => {
    respond(
      new Response(KEY),
      new Response(null, { status: 429 }),
      new Response(null, { status: 202 }),
    );

    const result = await IndexNowService.submitUrls(scope, [
      "https://example.com/a",
    ]);

    expect(submissions().map((submission) => submission.engine)).toEqual([
      "www.bing.com",
      "yandex.com",
    ]);
    expect(result.hosts[0]?.status).toBe("submitted");
  });

  it("reports a key IndexNow rejects without trying other engines", async () => {
    respond(new Response(KEY), new Response(null, { status: 403 }));

    const result = await IndexNowService.submitUrls(scope, [
      "https://example.com/a",
    ]);

    expect(submissions()).toHaveLength(1);
    expect(result.hosts[0]?.status).toBe("failed");
    expect(result.hosts[0]?.message).toContain("https://example.com");
  });
});

describe("IndexNowService.checkKeyFiles", () => {
  it("tells a host that forwards to www apart from a missing file", async () => {
    fetchMock.mockImplementation(async (input) =>
      input === `https://example.com/${KEY}.txt`
        ? new Response(null, {
            status: 301,
            headers: { location: `https://www.example.com/${KEY}.txt` },
          })
        : new Response("Not found", { status: 404 }),
    );

    const result = await IndexNowService.checkKeyFiles(scope);

    expect(result.hosts).toEqual([
      { host: "example.com", status: "moved" },
      { host: "www.example.com", status: "missing" },
    ]);
  });
});
