import { beforeEach, describe, expect, it, vi } from "vitest";

const bindings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("cloudflare:workers", () => ({ env: bindings.value }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));
import {
  chargeToolBudget,
  guardToolRequest,
  readToolBody,
} from "../src/lib/free-tools/server";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://seoshark.example/api/backlink-check", {
    method: "POST",
    headers: { "cf-connecting-ip": "203.0.113.1", ...headers },
  });
const guard = (turnstileToken: string | undefined = "token", headers = {}) =>
  guardToolRequest({
    tool: "backlink-checker",
    request: request(headers),
    turnstileToken,
  });
let fetchMock: ReturnType<typeof vi.fn>;
let limit: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("DEV", false);
  for (const key of Object.keys(bindings.value)) delete bindings.value[key];
  limit = vi.fn().mockResolvedValue({ success: true });
  bindings.value.TURNSTILE_SECRET_KEY = "production-secret";
  bindings.value.BACKLINK_CHECK_RATE_LIMIT = { limit };
  fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      success: true,
      hostname: "seoshark.example",
      action: "free_tool",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("public tool verification", () => {
  it("accepts a verified token for this hostname and purpose", async () => {
    expect(await guard()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["TURNSTILE_SECRET_KEY", "BACKLINK_CHECK_RATE_LIMIT"])(
    "fails closed without %s",
    async (key) => {
      delete bindings.value[key];
      expect((await guard())?.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("rejects a production test secret", async () => {
    bindings.value.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    expect((await guard())?.status).toBe(503);
  });
  it("requires Cloudflare's client IP in production", async () => {
    const req = request();
    req.headers.delete("cf-connecting-ip");
    expect(
      (
        await guardToolRequest({
          tool: "backlink-checker",
          request: req,
          turnstileToken: "token",
        })
      )?.status,
    ).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects cross-site submissions before any verification call", async () => {
    expect(
      (await guard("token", { origin: "https://attacker.example" }))?.status,
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects missing tokens", async () => {
    expect(
      (await guardToolRequest({ tool: "backlink-checker", request: request() }))
        ?.status,
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { success: false },
    { success: true, hostname: "other.example", action: "free_tool" },
    { success: true, hostname: "seoshark.example", action: "login" },
    { success: true },
  ])("rejects invalid or mismatched verification %j", async (data) => {
    fetchMock.mockResolvedValue(Response.json(data));
    expect((await guard())?.status).toBe(403);
  });
  it("rate limits across tools before contacting Turnstile", async () => {
    limit.mockResolvedValue({ success: false });
    expect((await guard())?.status).toBe(429);
    await guardToolRequest({
      tool: "competitor-analysis",
      request: request(),
      turnstileToken: "token",
    });
    expect(limit.mock.calls[0][0]).toEqual(limit.mock.calls[1][0]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed when verification or rate limiting is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect((await guard())?.status).toBe(503);
    limit.mockRejectedValue(new Error("binding down"));
    expect((await guard())?.status).toBe(503);
  });
});

describe("body and budget protections", () => {
  it("rejects oversized streamed JSON without relying on Content-Length", async () => {
    const req = new Request("https://seoshark.example/api/backlink-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "a".repeat(17000) }),
    });
    expect(((await readToolBody(req)) as Response).status).toBe(413);
  });
  it("requires JSON and accepts an ordinary small request", async () => {
    expect(((await readToolBody(request())) as Response).status).toBe(415);
    const req = new Request("https://seoshark.example/api/backlink-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"target":"seoshark.example"}',
    });
    expect(await readToolBody(req)).toEqual({ target: "seoshark.example" });
  });
  it("fails closed if budget coordination is missing or fails", async () => {
    const input = {
      tool: "backlink-checker" as const,
      request: request(),
      calls: 2,
    };
    expect((await chargeToolBudget(input))?.status).toBe(503);
    bindings.value.FREE_TOOL_BUDGET = {
      getByName: () => ({
        reserve: () => Promise.reject(new Error("unavailable")),
      }),
    };
    expect((await chargeToolBudget(input))?.status).toBe(503);
  });
  it("reserves the full run and hashes the IP before persistence", async () => {
    const reserve = vi.fn().mockResolvedValue("allowed");
    bindings.value.FREE_TOOL_BUDGET = { getByName: () => ({ reserve }) };
    expect(
      await chargeToolBudget({
        tool: "competitor-analysis",
        request: request(),
        calls: 5,
      }),
    ).toBeNull();
    expect(reserve.mock.calls[0][0]).toMatchObject({
      calls: 5,
      visitor: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    reserve.mockResolvedValue("daily");
    expect(
      (
        await chargeToolBudget({
          tool: "competitor-analysis",
          request: request(),
          calls: 5,
        })
      )?.status,
    ).toBe(429);
  });
});

describe("every free API protects cache hits and provider calls", () => {
  const cases = [
    ["backlink-check", { target: "seoshark.example" }],
    ["competitor-keyword-finder", { target: "seoshark.example", locationCode: 2840 }],
    ["keyword-generator", { keyword: "email marketing", locationCode: 2840 }],
    ["website-traffic-checker", { target: "seoshark.example", locationCode: 2840 }],
    ["competitor-analysis", { competitor: "seoshark.example", locationCode: 2840 }],
    ["spam-score-checker", { target: "seoshark.example" }],
    ["domain-age-checker", { domains: ["seoshark.example"] }],
  ] as const;
  it.each(cases)(
    "%s rejects missing verification before cache or provider access",
    async (slug, body) => {
      bindings.value.DATAFORSEO_API_KEY = "test-key";
      const match = vi.fn();
      vi.stubGlobal("caches", { default: { match } });
      const { Route } = await import(`../src/routes/api/${slug}.ts`);
      const response = await Route.server.handlers.POST({
        request: new Request(`https://seoshark.example/api/${slug}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.2",
          },
          body: JSON.stringify(body),
        }),
      });
      expect(response.status).toBe(403);
      expect(match).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each(cases.filter(([slug]) => slug !== "domain-age-checker"))(
    "%s never calls DataForSEO when the budget rejects a verified cache miss",
    async (slug, body) => {
      bindings.value.DATAFORSEO_API_KEY = "test-key";
      const reserve = vi.fn().mockResolvedValue("daily");
      bindings.value.FREE_TOOL_BUDGET = { getByName: () => ({ reserve }) };
      vi.stubGlobal("caches", {
        default: { match: vi.fn().mockResolvedValue(undefined) },
      });
      const { Route } = await import(`../src/routes/api/${slug}.ts`);
      const response = await Route.server.handlers.POST({
        request: new Request(`https://seoshark.example/api/${slug}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.2",
          },
          body: JSON.stringify({ ...body, turnstileToken: "token" }),
        }),
      });
      expect(response.status).toBe(429);
      expect(reserve).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
    },
  );
  it("serves a verified cache hit without reserving budget or contacting DataForSEO", async () => {
    bindings.value.DATAFORSEO_API_KEY = "test-key";
    const reserve = vi.fn();
    bindings.value.FREE_TOOL_BUDGET = { getByName: () => ({ reserve }) };
    vi.stubGlobal("caches", {
      default: {
        match: vi
          .fn()
          .mockResolvedValue(
            Response.json({ ok: true, data: { target: "seoshark.example" } }),
          ),
      },
    });
    const module = await import("../src/routes/api/backlink-check");
    const route = module.Route as unknown as {
      server: {
        handlers: { POST: (args: { request: Request }) => Promise<Response> };
      };
    };
    const response = await route.server.handlers.POST({
      request: new Request("https://seoshark.example/api/backlink-check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.2",
        },
        body: JSON.stringify({ target: "seoshark.example", turnstileToken: "token" }),
      }),
    });
    expect(response.status).toBe(200);
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/siteverify");
  });
});

describe("keyword discovery provider contracts", () => {
  const cases = [
    {
      slug: "competitor-keyword-finder",
      body: { target: "https://www.example.com/path", locationCode: 2840 },
      input: { target: "example.com", item_types: ["organic"] },
      item: {
        keyword_data: {
          keyword: "sample",
          keyword_info: { search_volume: 100 },
          keyword_properties: { keyword_difficulty: 12 },
        },
        ranked_serp_element: {
          serp_item: { rank_group: 3, url: "https://example.com/page" },
        },
      },
      expected: {
        keyword: "sample",
        searchVolume: 100,
        difficulty: 12,
        position: 3,
        url: "https://example.com/page",
      },
    },
    {
      slug: "keyword-generator",
      body: { keyword: "  Email   Marketing ", locationCode: 2840 },
      input: {
        keyword: "email marketing",
        include_clickstream_data: false,
        include_seed_keyword: false,
        ignore_synonyms: true,
      },
      item: {
        keyword: "email marketing tools",
        keyword_info: { search_volume: 100 },
        keyword_properties: { keyword_difficulty: null },
      },
      expected: {
        keyword: "email marketing tools",
        searchVolume: 100,
        difficulty: null,
      },
    },
  ];
  it.each(cases)(
    "$slug caps provider work and maps actual result fields",
    async ({ slug, body, input, item, expected }) => {
      bindings.value.DATAFORSEO_API_KEY = "test-key";
      const reserve = vi.fn().mockResolvedValue("allowed");
      bindings.value.FREE_TOOL_BUDGET = { getByName: () => ({ reserve }) };
      vi.stubGlobal("caches", {
        default: {
          match: vi.fn().mockResolvedValue(undefined),
          put: vi.fn().mockResolvedValue(undefined),
        },
      });
      fetchMock
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            hostname: "seoshark.example",
            action: "free_tool",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            tasks: [{ status_code: 20000, result: [{ items: [item] }] }],
          }),
        );
      const { Route } = await import(`../src/routes/api/${slug}.ts`);
      const response = await Route.server.handlers.POST({
        request: new Request(`https://seoshark.example/api/${slug}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.2",
          },
          body: JSON.stringify({
            ...body,
            turnstileToken: "token",
            limit: 100000,
          }),
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        locationCode: 2840,
        keywords: [expected],
      });
      expect(reserve.mock.calls[0][0]).toMatchObject({ tool: slug, calls: 1 });
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual([
        expect.objectContaining({
          ...input,
          limit: 20,
          location_code: 2840,
          language_code: "en",
        }),
      ]);
      expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
        fetchMock.mock.invocationCallOrder[1],
      );
    },
  );
});
