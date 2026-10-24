import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readPages } from "@/server/lib/scrape";

// Separate file from scrape.test.ts: that suite needs the real SSRF guard.
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: vi.fn(async (url: string) => url),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          "<p>Use &amp;lt;b&amp;gt; for bold</p><script>secret()</script\t\n bar>",
          { status: 200, headers: { "content-type": "text/html" } },
        ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("decodes entities once and strips script tags with a spaced end tag", async () => {
  const { pages } = await readPages(["https://example.com/"]);

  expect(pages[0]?.text).toBe("Use &lt;b&gt; for bold");
});
