import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleSharedReportRequest,
  NOT_SHARED_BODY,
} from "@/routes/s/$token/raw";
import { REPORT_CSP } from "@/shared/report-sandbox";

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_MODE: "hosted" as string | undefined,
  },
  getSharedReportByToken: vi.fn(),
  getReportHtml: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: mocks.env,
  waitUntil: (promise: Promise<unknown>) => void promise,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/server/features/reports/repositories/ReportRepository", () => ({
  ReportRepository: {
    getSharedReportByToken: mocks.getSharedReportByToken,
    getReportHtml: mocks.getReportHtml,
  },
}));

const TOKEN = "a".repeat(32);
const HTML = "<!doctype html><html><body>report</body></html>";

/** Framed is the normal case; the `Sec-Fetch-Dest` header is what says so. */
const framed = () =>
  new Request(`https://app.example.com/s/${TOKEN}/raw`, {
    headers: { "Sec-Fetch-Dest": "iframe" },
  });

const topLevel = () =>
  new Request(`https://app.example.com/s/${TOKEN}/raw`, {
    headers: { "Sec-Fetch-Dest": "document" },
  });

/** A client that sends no `Sec-Fetch-Dest` at all: curl, an old browser. */
const noFetchMetadata = () =>
  new Request(`https://app.example.com/s/${TOKEN}/raw`);

/** A cache-key buster: any query string at all. */
const withQuery = () =>
  new Request(`https://app.example.com/s/${TOKEN}/raw?x=1`, {
    headers: { "Sec-Fetch-Dest": "iframe" },
  });

const SHARED_REPORT = {
  id: "report_1",
  projectId: "project_1",
  organizationId: "org_1",
  title: "badseo.dev SEO audit",
  summary: "One clear verdict.",
  skill: "seo-audit",
  updatedAt: "2026-09-01T10:00:00.000Z",
  archived: false,
};

beforeEach(() => {
  mocks.env.AUTH_MODE = "hosted";
  mocks.getSharedReportByToken.mockResolvedValue(SHARED_REPORT);
  mocks.getReportHtml.mockResolvedValue(HTML);
});

describe("handleSharedReportRequest", () => {
  it("serves the stored document to the frame with the sandbox headers", async () => {
    const response = await handleSharedReportRequest(TOKEN, framed());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(HTML);
    expect(Object.fromEntries(response.headers)).toEqual({
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": REPORT_CSP,
      "cross-origin-opener-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=0, s-maxage=60",
    });
  });

  // The whole point of the wrapper page: shared content always carries our
  // chrome, so the document is unreachable on its own.
  it("bounces a top-level request to the wrapped page", async () => {
    const response = await handleSharedReportRequest(TOKEN, topLevel());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/s/${TOKEN}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getReportHtml).not.toHaveBeenCalled();
  });

  // The query string is part of the edge cache key, so it is stripped before
  // anything is read.
  it("bounces a query string to the bare path without querying", async () => {
    const response = await handleSharedReportRequest(TOKEN, withQuery());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/s/${TOKEN}/raw`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getSharedReportByToken).not.toHaveBeenCalled();
  });

  // The redirect needs the header to say so. Bouncing a client that sends no
  // fetch metadata would send it to a page whose frame it cannot load either.
  it("serves the document when the request carries no Sec-Fetch-Dest", async () => {
    const response = await handleSharedReportRequest(TOKEN, noFetchMetadata());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(HTML);
  });

  it.each([
    [
      "an unknown or revoked token",
      () => mocks.getSharedReportByToken.mockResolvedValue(null),
    ],
    // Restoring the project brings the link back, so this is not a 404 body
    // that says anything different.
    [
      "an archived project",
      () =>
        mocks.getSharedReportByToken.mockResolvedValue({
          ...SHARED_REPORT,
          archived: true,
        }),
    ],
    // Sharing is hosted-only.
    [
      "a deployment that is not hosted",
      () => {
        mocks.env.AUTH_MODE = "cloudflare_access";
      },
    ],
  ])("answers the same 404 for %s", async (_case, arrange) => {
    arrange();

    const response = await handleSharedReportRequest(TOKEN, framed());

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(NOT_SHARED_BODY);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getReportHtml).not.toHaveBeenCalled();
  });

  it("answers a malformed token without querying", async () => {
    const response = await handleSharedReportRequest("nope", framed());

    expect(response.status).toBe(404);
    expect(mocks.getSharedReportByToken).not.toHaveBeenCalled();
  });
});
