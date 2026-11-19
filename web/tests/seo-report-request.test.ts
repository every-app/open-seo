import { beforeEach, describe, expect, it, vi } from "vitest";

const bindings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("cloudflare:workers", () => ({
  env: bindings.value,
  DurableObject: class {},
}));
vi.mock("../src/lib/seo-report/removed-sites.json", () => ({
  default: ["example.org"],
}));
import type { SeoReportEnv } from "../src/lib/seo-report/config";
import {
  SeoReportAccepted as Accepted,
  SeoReportRefusal as Refusal,
} from "../src/lib/seo-report/contract";
import type { Ask } from "../src/lib/seo-report/desk";
import { requestReport } from "../src/lib/seo-report/request";
import { MODEL } from "./seo-report-support";

// What reaches the desk, and what is turned away before it: the order of
// checks when the form is sent, from this site's page or a partner's.

const PARTNER = "https://partner.example";
const ask = vi.fn(async (_: Ask) => Accepted.Writing);
const env = {
  SEO_REPORT_PARTNER_ORIGINS: PARTNER,
  ...MODEL,
  OPENROUTER_API_KEY: "key",
  DATAFORSEO_API_KEY: "key",
  LOOPS_API_KEY: "key",
  LOOPS_SEO_REPORT_READY_ID: "id",
  LOOPS_SEO_REPORT_FAILED_ID: "id",
  SEO_REPORT_DESK: { idFromName: () => "desk", get: () => ({ ask }) },
} as unknown as SeoReportEnv;

/** What the outside world answers: Turnstile's verdict and whether DNS knows the name. */
const world = { turnstileHost: "openseo.so", dnsStatus: 0 };
let fetchMock: ReturnType<typeof vi.fn>;

const send = (
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  requestReport(
    new Request("https://openseo.so/api/seo-report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
        ...headers,
      },
      body: JSON.stringify({ turnstileToken: "token", ...body }),
    }),
    env,
  );
const good = { site: "example.com", email: "person@inbox.test" };

beforeEach(() => {
  vi.stubEnv("DEV", false);
  env.OPENROUTER_API_KEY = "key";
  world.turnstileHost = "openseo.so";
  world.dnsStatus = 0;
  bindings.value.TURNSTILE_SECRET_KEY = "production-secret";
  bindings.value.BACKLINK_CHECK_RATE_LIMIT = {
    limit: async () => ({ success: true }),
  };
  fetchMock = vi.fn(async (input: string | URL) =>
    String(input).includes("siteverify")
      ? Response.json({
          success: true,
          hostname: world.turnstileHost,
          action: "free_tool",
        })
      : Response.json({ Status: world.dnsStatus }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("refused before anything is looked up or counted", () => {
  it("answers unavailable, and logs which secret is missing, when one isn't set", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    delete env.OPENROUTER_API_KEY;
    expect(await send(good)).toBe(Refusal.Unavailable);
    expect(JSON.parse(String(logged.mock.calls[0]?.[0]))).toEqual({
      event: "seo_report_not_configured",
      missing: ["OPENROUTER_API_KEY"],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "co.uk",
    "github.io",
    "203.0.113.7",
    "localhost",
    "printer.internal",
    "example.com:8080",
    "user:pass@example.com",
    "ftp://example.com",
    "example.com..",
    "home.arpa",
    "1.0.0.127.in-addr.arpa",
    // A message dressed as a site name: too long, or too many labels.
    "your-account-was-charged-499-dollars-call-1-800-555-0100-now.example.com",
    "call.this.number.now.example.com",
  ])("refuses %s as a site", async (site) => {
    expect(await send({ ...good, site })).toBe(Refusal.InvalidSite);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a removed site and every name under it", async () => {
    expect(await send({ ...good, site: "example.org" })).toBe(Refusal.Removed);
    expect(await send({ ...good, site: "app.example.org" })).toBe(
      Refusal.Removed,
    );
    expect(ask).not.toHaveBeenCalled();
  });

  it("refuses a name DNS doesn't know", async () => {
    world.dnsStatus = 3;
    expect(await send(good)).toBe(Refusal.SiteNotFound);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("who may send it", () => {
  it("takes a partner's request and names the partner as the source", async () => {
    world.turnstileHost = "partner.example";
    expect(
      await send({ ...good, source: "anything" }, { origin: PARTNER }),
    ).toBe(Accepted.Writing);
    expect(ask.mock.calls[0]![0]).toMatchObject({
      site: "example.com",
      source: "partner.example",
    });
  });

  it("names this site's page as the source of its own requests", async () => {
    await send(good, { origin: "https://openseo.so" });
    expect(ask.mock.calls[0]![0].source).toBe("openseo.so/seo-report");
  });

  it("refuses an origin that isn't listed", async () => {
    expect(await send(good, { origin: "https://other.example" })).toBe(
      Refusal.OriginNotAllowed,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a token solved on one allowed site and sent from another", async () => {
    world.turnstileHost = "openseo.so";
    expect(await send(good, { origin: PARTNER })).toBe(Refusal.NotHuman);
  });

  it("refuses a token from a site that isn't allowed", async () => {
    world.turnstileHost = "other.example";
    expect(await send(good)).toBe(Refusal.NotHuman);
    expect(ask).not.toHaveBeenCalled();
  });
});

it("knows one site by one name however it is typed", async () => {
  for (const site of [
    "https://WWW.Example.com/pricing?x=1",
    "example.com.",
    "www.www.example.com",
  ])
    await send({ ...good, site });
  expect(ask.mock.calls.map(([asked]) => asked.site)).toEqual([
    "example.com",
    "example.com",
    "example.com",
  ]);
  // The longest ordinary names are still sites.
  await send({ ...good, site: "mercuryautomatedretailsolutions.com" });
  await send({ ...good, site: "shop.example.co.uk" });
  expect(ask).toHaveBeenCalledTimes(5);
});

it("counts one mailbox for an address's plus-tags and Gmail dots, and one network for an IPv6 /48", async () => {
  await send({ ...good, email: "Not.A.Real.Mailbox+news@gmail.com" });
  await send(
    { ...good, email: "notarealmailbox@googlemail.com" },
    { "cf-connecting-ip": "2001:db8:1:aaaa::1" },
  );
  await send(
    { ...good, email: "other@inbox.test" },
    { "cf-connecting-ip": "2001:db8:1:bbbb::2" },
  );
  const [first, second, third] = ask.mock.calls.map(([asked]) => asked);
  expect(first!.mailbox).toBe(second!.mailbox);
  expect(second!.network).toBe(third!.network);
  expect(first!.network).not.toBe(second!.network);
  // The email goes to the address as typed; only a hash is counted.
  expect(first!.email).toBe("not.a.real.mailbox+news@gmail.com");
  expect(first!.mailbox).toMatch(/^[a-f0-9]{64}$/);
});
