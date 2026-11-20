import { expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
vi.mock("cloudflare:workers", () => ({
  env: {
    SEO_REPORT_DESK: {
      idFromName: () => "desk",
      get: () => ({ report: read }),
    },
  },
  DurableObject: class {},
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  notFound: () => new Error("not found"),
}));
import { Route } from "../src/routes/_marketing/seo-report_.r.$token";
import { report } from "./seo-report-support";

// What the link in a report's email answers.

const NEXT = { isNext: true };
function open(token: string) {
  const { GET } = (
    Route as unknown as {
      server: {
        handlers: {
          GET: (args: {
            params: { token: string };
            next: () => typeof NEXT;
          }) => Promise<Response | typeof NEXT>;
        };
      };
    }
  ).server.handlers;
  return GET({ params: { token }, next: () => NEXT });
}

it("downloads the report as a PDF named for its site, which nothing may index or keep", async () => {
  read.mockResolvedValue(report("example.com"));
  const response = await open("0123456789abcdef0123456789abcdef");
  if (!(response instanceof Response)) throw new Error("no download");
  expect(Object.fromEntries(response.headers)).toEqual({
    "content-type": "application/pdf",
    "content-disposition": 'attachment; filename="seo-report-example.com.pdf"',
    "x-robots-tag": "noindex, nofollow",
    "cache-control": "private, no-store",
  });
  expect(await response.text()).toMatch(/^%PDF-/);
});

it("leaves a link with no report behind it to the site's not-found page", async () => {
  read.mockResolvedValue(null);
  expect(await open("0123456789abcdef0123456789abcdef")).toBe(NEXT);
});
