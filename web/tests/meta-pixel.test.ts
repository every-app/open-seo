import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: { META_PIXEL_ID: "123" } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));
import { Route } from "../src/routes/js/meta[.]js";

const route = Route as unknown as {
  server: { handlers: { GET: (args: { request: Request }) => Response } };
};

async function servesPixel(country: string, headers = {}) {
  const response = route.server.handlers.GET({
    request: new Request("https://openseo.so/js/meta.js", {
      headers: { "cf-ipcountry": country, ...headers },
    }),
  });
  // The answer differs per visitor, so no shared cache may keep it.
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return (await response.text()).includes("fbq('init'");
}

describe("/js/meta.js", () => {
  it("serves the pixel only where the visitor's advertising choice allows it", async () => {
    // The full set of region and saved-choice cases is in
    // src/shared/privacy-choices.test.ts; this covers the route's inputs.
    expect(await servesPixel("DE", { cookie: "openseo_privacy=a0.d0.m1" })).toBe(
      true,
    );
    expect(await servesPixel("US", { "sec-gpc": "1" })).toBe(false);
  });
});
