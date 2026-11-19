import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: { META_PIXEL_ID: "123" } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));
import { ANALYTICS_SCRIPT } from "../src/lib/analytics-script";
import { Route } from "../src/routes/js/meta[.]js";

// A written report's address is the only way to it, so nothing that records
// page addresses may run there.

/** Runs the head's analytics script on a page, and says which scripts it added. */
function scriptsLoadedOn(pathname: string) {
  const added: string[] = [];
  const page: Record<string, unknown> = {
    requestIdleCallback: (load: () => void) => load(),
    document: {
      readyState: "complete",
      createElement: () => ({ setAttribute: () => {} }),
      head: {
        appendChild: (script: { src: string }) => added.push(script.src),
      },
    },
    location: { pathname },
    localStorage: { getItem: () => null },
  };
  // In a browser the window is also where globals live.
  page.window = page;
  runInNewContext(ANALYTICS_SCRIPT, page);
  return added;
}

async function servesPixel(referer?: string) {
  const { GET } = (
    Route as unknown as {
      server: { handlers: { GET: (args: { request: Request }) => Response } };
    }
  ).server.handlers;
  const response = GET({
    request: new Request("https://openseo.so/js/meta.js", {
      headers: { "cf-ipcountry": "US", ...(referer ? { referer } : {}) },
    }),
  });
  return (await response.text()).includes("fbq('init'");
}

describe("a written report's page", () => {
  it("loads neither Plausible nor OpenAnalytics, which every other page does", () => {
    expect(
      scriptsLoadedOn("/seo-report/r/0123456789abcdef0123456789abcdef"),
    ).toEqual([]);
    expect(scriptsLoadedOn("/seo-report")).toEqual([
      "/js/script.js",
      expect.stringContaining("analytics.everyapp.team"),
    ]);
  });

  it("is refused the Meta Pixel", async () => {
    expect(await servesPixel("https://openseo.so/pricing")).toBe(true);
    expect(await servesPixel()).toBe(true);
    expect(
      await servesPixel(
        "https://openseo.so/seo-report/r/0123456789abcdef0123456789abcdef",
      ),
    ).toBe(false);
  });
});
