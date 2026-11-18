import { expect, it, vi } from "vitest";
import { handleCspReport, reportOnlyCsp } from "./csp";

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
    "script-src 'self' 'nonce-abc' https://challenges.cloudflare.com https://us.i.posthog.com https://us-assets.i.posthog.com",
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
  );
  expect(response.status).toBe(204);
  expect(warn).toHaveBeenCalledWith(
    "[csp-report]",
    JSON.stringify({
      directive: "img-src",
      blocked: "https://evil.example/px.png",
      page: "https://app.openseo.so/reset-password",
    }),
  );
});

it("drops a violation a browser extension caused", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await handleCspReport(
    report({ "source-file": "chrome-extension://abcdef/content.js" }),
    undefined,
  );
  expect(warn).not.toHaveBeenCalled();
});

it("refuses an oversized report and an IP over its limit", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const big = await handleCspReport(
    report({ "blocked-uri": "x".repeat(9000) }),
    undefined,
  );
  expect(big.status).toBe(413);

  const limiter = { limit: vi.fn(() => Promise.resolve({ success: false })) };
  const limited = await handleCspReport(report({}), limiter);
  expect(limited.status).toBe(429);
  expect(limiter.limit).toHaveBeenCalledWith({ key: "203.0.113.1" });
  expect(warn).not.toHaveBeenCalled();
});
