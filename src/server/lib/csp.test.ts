import { expect, it, vi } from "vitest";
import { handleCspReport, reportOnlyCsp } from "./csp";

const POSTHOG_HOST = "https://us.i.posthog.com";
const ASSET = "https://app.openseo.so/assets/index.js";

const report = (fields: Record<string, unknown>, ip = "203.0.113.1") => {
  const body = JSON.stringify({ "csp-report": fields });
  return new Request("https://app.openseo.so/api/csp-report", {
    method: "POST",
    headers: {
      "cf-connecting-ip": ip,
      "content-length": String(body.length),
    },
    body,
  });
};

it("allows inline scripts by nonce only, and PostHog Cloud's bundle host", () => {
  const scripts = reportOnlyCsp({
    nonce: "abc",
    host: "app.openseo.so",
    posthogHost: "https://us.i.posthog.com",
  })
    .split("; ")
    .find((directive) => directive.startsWith("script-src"));
  expect(scripts).toBe(
    "script-src 'self' 'nonce-abc' 'report-sample' https://challenges.cloudflare.com https://us.i.posthog.com https://us-assets.i.posthog.com",
  );
});

it("logs a report without the query strings its URLs carried", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const response = await handleCspReport(
    report({
      "effective-directive": "img-src",
      "blocked-uri": "https://evil.example/px.png?d=secret",
      "document-uri": "https://app.openseo.so/reset-password?token=secret",
    }),
    undefined,
    POSTHOG_HOST,
  );
  expect(response.status).toBe(204);
  expect(warn).toHaveBeenCalledWith(
    "[csp-report]",
    JSON.stringify({
      ours: "no",
      directive: "img-src",
      blocked: "https://evil.example/px.png",
      page: "https://app.openseo.so/reset-password",
    }),
  );
});

it.each([
  ["an extension script", { "source-file": "chrome-extension" }],
  [
    "an extension script, as Safari names it",
    { "source-file": "safari-web-extension://abcdef/content.js" },
  ],
  ["an extension resource", { "blocked-uri": "moz-extension" }],
  [
    "a script Firefox runs for an extension",
    { "source-file": "sandbox eval code" },
  ],
  [
    "a frame an extension drew",
    {
      "document-uri": "about",
      "blocked-uri": "https://fonts.gstatic.com/s/figtree/v9/x.woff2",
    },
  ],
])("drops a violation caused by %s", async (_case, fields) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await handleCspReport(report(fields), undefined, POSTHOG_HOST);
  expect(warn).not.toHaveBeenCalled();
});

it.each([
  [
    "yes",
    "a host the app runs scripts from, refused under another directive",
    {
      "effective-directive": "connect-src",
      "blocked-uri": "https://challenges.cloudflare.com/cdn-cgi/x",
    },
  ],
  [
    "yes",
    "a script one of the app's bundles added",
    {
      "effective-directive": "script-src-elem",
      "blocked-uri": "https://cdn.vendor.example/sdk.js",
      "source-file": ASSET,
    },
  ],
  [
    "maybe",
    "an inline script",
    { "effective-directive": "script-src-elem", "blocked-uri": "inline" },
  ],
  [
    "no",
    "a font the app's bundle only laid out",
    {
      "effective-directive": "font-src",
      "blocked-uri": "https://fonts.gstatic.com/s/inter/v20/x.woff2",
      "source-file": ASSET,
    },
  ],
  [
    "no",
    "another site framing the page",
    {
      "violated-directive": "frame-ancestors 'self'",
      "blocked-uri": "https://app.openseo.so/",
    },
  ],
])("marks ours %s for %s", async (ours, _case, fields) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await handleCspReport(report(fields), undefined, POSTHOG_HOST);
  expect(warn).toHaveBeenCalledWith(
    "[csp-report]",
    expect.stringContaining(`"ours":"${ours}"`),
  );
});

it("refuses an oversized report and an IP over its limit", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const big = await handleCspReport(
    report({ "blocked-uri": "x".repeat(9000) }),
    undefined,
    POSTHOG_HOST,
  );
  expect(big.status).toBe(413);

  const limiter = { limit: vi.fn(() => Promise.resolve({ success: false })) };
  const limited = await handleCspReport(report({}), limiter, POSTHOG_HOST);
  expect(limited.status).toBe(429);
  expect(limiter.limit).toHaveBeenCalledWith({ key: "203.0.113.1" });
  expect(warn).not.toHaveBeenCalled();
});
