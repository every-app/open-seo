import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderedPageService } from "./rendered-page";
import { MAX_HTML_BYTES } from "./html-response";
import { isAuditRenderingAllowed } from "./rendering-policy";

const url = "https://example.com/page";
const html =
  "<html><head><title>Rendered</title></head><body>Loaded content</body></html>";
const browser = { quickAction: vi.fn() };
function cloudflare(
  status = 200,
  content = html,
  finalUrl = url,
  headers: Record<string, string> = {},
) {
  return Response.json({
    success: true,
    result: content,
    meta: { status, finalUrl, headers },
  });
}
function context(overrides: Record<string, unknown> = {}, status = 200) {
  return Response.json(
    {
      success: true,
      type: "html",
      html,
      metadata: { finalUrl: url },
      finalDOMState: "loaded",
      key_metadata: { credits_consumed: 1 },
      ...overrides,
    },
    { status },
  );
}
function render(
  options: { browser?: typeof browser; contextApiKey?: string } = {
    browser,
    contextApiKey: "context-test-key",
  },
  target = url,
) {
  const usage = { cloudflareAttempts: 0, contextCredits: 0 };
  const page = RenderedPageService.renderPage(target, {
    ...options,
    auditId: "audit",
    usage,
  });
  return { page, usage };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("rendered page providers", () => {
  it("renders on Cloudflare with its full timeout and never calls Context", async () => {
    browser.quickAction.mockResolvedValue(
      cloudflare(200, html, url, { "set-cookie": "one\ntwo" }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { page, usage } = render();
    expect(await page).toEqual({ html, status: 200 });
    expect(usage).toEqual({ cloudflareAttempts: 1, contextCredits: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(browser.quickAction).toHaveBeenCalledWith("content", {
      url,
      cacheTTL: 0,
      gotoOptions: { waitUntil: "networkidle2", timeout: 20_000 },
    });
  });

  it.each([
    ["a bot challenge", cloudflare(200, "<title>Just a moment...</title>")],
    [
      "a mitigation header",
      cloudflare(200, html, url, { "Cf-MiTiGaTeD": "challenge" }),
    ],
    ["an origin block", cloudflare(403)],
    ["an origin error", cloudflare(503)],
    ["a browser error", new Response(null, { status: 429 })],
  ])(
    "falls back to fresh full HTML from Context after %s, counting both attempts",
    async (_case, cloudflareResponse) => {
      browser.quickAction.mockResolvedValue(cloudflareResponse);
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(context());
      const { page, usage } = render();
      expect(await page).toEqual({ html, status: null });
      expect(usage).toEqual({ cloudflareAttempts: 1, contextCredits: 1 });
      const [endpoint, request] = fetchMock.mock.calls[0];
      if (!(endpoint instanceof URL)) throw new Error("Expected a URL request");
      expect(endpoint.origin + endpoint.pathname).toBe(
        "https://api.context.dev/v1/web/scrape/html",
      );
      expect(Object.fromEntries(endpoint.searchParams)).toMatchObject({
        url,
        maxAgeMs: "0",
        useMainContentOnly: "false",
        "timeoutOpts[behavior]": "fail",
        "pdf[shouldParse]": "false",
      });
      expect(request?.headers).toEqual({
        Authorization: "Bearer context-test-key",
      });
    },
  );

  it("does not mistake a background challenge script for a blocked page", async () => {
    browser.quickAction.mockResolvedValue(
      cloudflare(
        200,
        '<html><head><title>Our products</title><script src="/challenge-platform/check"></script></head><body>Real content</body></html>',
      ),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await render().page;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the first 1 MiB of an oversized render, as the direct crawl does", async () => {
    const head = "<html><head><title>Big page</title></head><body>";
    browser.quickAction.mockResolvedValue(
      cloudflare(200, head + "x".repeat(MAX_HTML_BYTES)),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { html: rendered } = await render().page;
    expect(rendered.startsWith(head)).toBe(true);
    expect(new TextEncoder().encode(rendered).length).toBe(MAX_HTML_BYTES);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    cloudflare(200, html, "https://elsewhere.example/"),
    cloudflare(200, "  "),
    Response.json({ success: true, result: html }),
  ])(
    "fails without a fallback when Cloudflare returns an unusable document",
    async (response) => {
      browser.quickAction.mockResolvedValue(response);
      const { page, usage } = render({ browser });
      await expect(page).rejects.toThrow("Unable to render");
      expect(usage).toEqual({ cloudflareAttempts: 1, contextCredits: 0 });
    },
  );

  it("renders through Context alone where there is no browser", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(context());
    const { page, usage } = render({ contextApiKey: "context-test-key" });
    expect(await page).toEqual({ html, status: null });
    expect(usage).toEqual({ cloudflareAttempts: 0, contextCredits: 1 });
  });

  it.each([
    { success: false },
    { type: "pdf" },
    { finalDOMState: "still-loading" },
    { metadata: { finalUrl: "https://elsewhere.example/" } },
  ])(
    "rejects an unusable Context document %o but still counts its reported credit",
    async (overrides) => {
      browser.quickAction.mockRejectedValue(new Error("Browser failed"));
      vi.spyOn(globalThis, "fetch").mockResolvedValue(context(overrides));
      const { page, usage } = render();
      await expect(page).rejects.toThrow("Unable to render");
      expect(usage.contextCredits).toBe(1);
    },
  );

  it("counts usage reported on a Context HTTP error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: "timeout", key_metadata: { credits_consumed: 1 } },
        { status: 408 },
      ),
    );
    const { page, usage } = render({ contextApiKey: "context-test-key" });
    await expect(page).rejects.toThrow("Unable to render");
    expect(usage.contextCredits).toBe(1);
  });

  it("fails once per provider without retrying, logging no provider payload", async () => {
    browser.quickAction.mockRejectedValue(
      new Error("private provider payload"),
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("private provider payload", { status: 429 }),
      );
    const { page, usage } = render();
    await expect(page).rejects.toThrow("Unable to render");
    // A failure that reports no usage is not charged as a Context credit.
    expect(usage).toEqual({ cloudflareAttempts: 1, contextCredits: 0 });
    expect(browser.quickAction).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      "private provider payload",
    );
  });

  it("assumes one credit for a usable Context page that omits its usage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      context({ key_metadata: undefined }),
    );
    const { page, usage } = render({ contextApiKey: "context-test-key" });
    await page;
    expect(usage.contextCredits).toBe(1);
  });

  it.each([
    "http://127.0.0.1/",
    "http://metadata.google.internal/",
    "https://name:password@example.com/",
    "file:///etc/passwd",
  ])("rejects unsafe target %s before calling a provider", async (target) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(render(undefined, target).page).rejects.toThrow(
      "Invalid rendering target",
    );
    expect(browser.quickAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rendering availability", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exists when a browser is bound or a Context key is set, whatever the auth mode", async () => {
    // A legacy Wrangler install runs cloudflare_access with no browser.
    vi.stubEnv("AUTH_MODE", "cloudflare_access");
    expect(await isAuditRenderingAllowed()).toBe(false);
    vi.stubEnv("CONTEXT_API_KEY", "context-test-key");
    expect(await isAuditRenderingAllowed()).toBe(true);
    // An Alchemy preview runs local_noauth with a browser.
    vi.stubEnv("CONTEXT_API_KEY", "");
    vi.stubEnv("AUTH_MODE", "local_noauth");
    vi.stubEnv("AUDIT_BROWSER_RENDERING", "true");
    expect(await isAuditRenderingAllowed()).toBe(true);
  });
});
