import { beforeEach, expect, it, vi } from "vitest";

const bindings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("cloudflare:workers", () => ({
  env: bindings.value,
  DurableObject: class {},
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));
import { Route } from "../src/routes/api/seo-report";
import { MODEL } from "./seo-report-support";

// The API as another site sees it: who gets CORS headers, and the shape of
// every answer (docs/maintainers/free-seo-report.md).

type Handler = (context: { request: Request }) => Response | Promise<Response>;
const handlers = (
  Route as unknown as { server: { handlers: Record<string, Handler> } }
).server.handlers;
const call = (method: string, origin?: string) =>
  handlers[method]!({
    request: new Request("https://openseo.so/api/seo-report", {
      method,
      headers: {
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    }),
  });

beforeEach(() => {
  vi.stubEnv("DEV", false);
  for (const key of Object.keys(bindings.value)) delete bindings.value[key];
  bindings.value.SEO_REPORT_PARTNER_ORIGINS = "https://partner.example";
});

it("answers a listed partner's preflight and no other site's", async () => {
  const allowed = await call("OPTIONS", "https://partner.example");
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://partner.example",
  );
  const refused = await call("OPTIONS", "https://other.example");
  expect(refused.status).toBe(403);
  expect(refused.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

it("says whether the tool can take a request, to a partner too", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Nothing is configured on this Worker.
  const answer = await call("GET", "https://partner.example");
  expect(await answer.json()).toEqual({ open: false });
  expect(answer.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://partner.example",
  );
  expect(
    (await call("GET", "https://other.example")).headers.has(
      "Access-Control-Allow-Origin",
    ),
  ).toBe(false);
  Object.assign(bindings.value, MODEL, {
    OPENROUTER_API_KEY: "key",
    DATAFORSEO_API_KEY: "key",
    LOOPS_API_KEY: "key",
    LOOPS_SEO_REPORT_READY_ID: "id",
    LOOPS_SEO_REPORT_FAILED_ID: "id",
  });
  expect(await (await call("GET")).json()).toEqual({ open: true });
});

it("answers every request with a status, its sentence and the matching HTTP code", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const answer = await call("POST", "https://partner.example");
  expect(answer.status).toBe(503);
  expect(await answer.json()).toEqual({
    status: "unavailable",
    message: "Reports aren't available right now.",
  });
  expect(answer.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://partner.example",
  );
});

it("tells a partner the tool is unavailable, with its CORS header, when a request breaks part-way", async () => {
  vi.stubEnv("DEV", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", async () => Response.json({ Status: 0 }));
  // Configured, but the desk itself is missing.
  bindings.value.SEO_REPORT_STAND_INS = "model,email";
  Object.assign(bindings.value, MODEL);
  const answer = await handlers.POST!({
    request: new Request("https://openseo.so/api/seo-report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://partner.example",
      },
      body: JSON.stringify({ site: "example.com", email: "person@inbox.test" }),
    }),
  });
  expect(answer.status).toBe(503);
  expect(await answer.json()).toMatchObject({ status: "unavailable" });
  expect(answer.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://partner.example",
  );
});

it("stays closed when the model it is told to use has no prices", async () => {
  vi.stubEnv("DEV", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  bindings.value.SEO_REPORT_STAND_INS = "model,email";
  Object.assign(bindings.value, MODEL);
  expect(await (await call("GET")).json()).toEqual({ open: true });
  bindings.value.SEO_REPORT_MODEL = "openai/gpt-7-not-priced-yet";
  expect(await (await call("GET")).json()).toEqual({ open: false });
});
