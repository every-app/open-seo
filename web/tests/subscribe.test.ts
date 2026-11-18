import { beforeEach, expect, it, vi } from "vitest";

const bindings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("cloudflare:workers", () => ({ env: bindings.value }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));
import { Route } from "../src/routes/api/subscribe";

const subscribe = (headers: Record<string, string> = {}) => {
  const { POST } = (
    Route as unknown as {
      server: {
        handlers: { POST(input: { request: Request }): Promise<Response> };
      };
    }
  ).server.handlers;
  return POST({
    request: new Request("https://openseo.so/api/subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.1",
        ...headers,
      },
      body: JSON.stringify({ email: "reader@example.com" }),
    }),
  });
};
let fetchMock: ReturnType<typeof vi.fn>;
let limit: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("DEV", false);
  for (const key of Object.keys(bindings.value)) delete bindings.value[key];
  limit = vi.fn().mockResolvedValue({ success: true });
  bindings.value.LOOPS_API_KEY = "loops-key";
  bindings.value.BACKLINK_CHECK_RATE_LIMIT = { limit };
  fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
});

it("adds the address for a visitor on the site", async () => {
  expect((await subscribe({ origin: "https://openseo.so" })).status).toBe(200);
  expect(limit).toHaveBeenCalledWith({ key: "subscribe:203.0.113.1" });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("refuses another site's submission without adding the address", async () => {
  const response = await subscribe({ origin: "https://attacker.example" });
  expect(response.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses a visitor over the limit without adding the address", async () => {
  limit.mockResolvedValue({ success: false });
  expect((await subscribe()).status).toBe(429);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses when the deployed build has no limiter", async () => {
  delete bindings.value.BACKLINK_CHECK_RATE_LIMIT;
  expect((await subscribe()).status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});
