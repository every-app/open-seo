import { beforeEach, expect, it, vi } from "vitest";
import { readPage } from "../src/lib/seo-report/read-page";

// How a report reads a page: its own site only, as robots.txt allows, with
// every redirect checked, and without a page being able to cost much.

const pages = new Map<string, () => Response>();
const html = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/html" } });
const run = () => ({ site: "example.com", robots: new Map() });
let fetchMock: ReturnType<typeof vi.fn>;
const requested = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  pages.clear();
  pages.set(
    "https://example.com/robots.txt",
    () => new Response("", { status: 404 }),
  );
  fetchMock = vi.fn(async (input: URL) => {
    const page = pages.get(String(input));
    if (!page) throw new Error("no answer");
    return page();
  });
  vi.stubGlobal("fetch", fetchMock);
});

it("reads a page of the site as text", async () => {
  pages.set("https://example.com/about", () =>
    html("<h1>About</h1><script>track()</script><p>We sell &amp; repair.</p>"),
  );
  expect(await readPage("https://example.com/about", run())).toBe(
    "https://example.com/about\n\nAbout\nWe sell & repair.",
  );
});

it.each([
  ["https://example.net/", /own site/],
  ["https://example.com.example.net/", /own site/],
  ["http://127.0.0.1/", /not a public web address/],
  ["https://example.com:8443/", /not a public web address/],
  ["file:///etc/passwd", /not a public web address/],
])("refuses %s without requesting anything", async (address, why) => {
  expect(await readPage(address, run())).toMatch(why);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses a redirect that leaves the site, before following it", async () => {
  pages.set(
    "https://example.com/out",
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://example.net/" },
      }),
  );
  expect(await readPage("https://example.com/out", run())).toMatch(/own site/);
  expect(requested()).not.toContain("https://example.net/");
});

it("follows at most three redirects", async () => {
  for (const hop of [0, 1, 2, 3])
    pages.set(
      `https://example.com/${hop}`,
      () =>
        new Response(null, {
          status: 301,
          headers: { Location: `/${hop + 1}` },
        }),
    );
  expect(await readPage("https://example.com/0", run())).toMatch(
    /too many times/,
  );
});

it("obeys robots.txt, for this crawler's name and for everyone", async () => {
  pages.set(
    "https://example.com/robots.txt",
    () =>
      new Response(
        "User-agent: *\nDisallow: /private\n\nUser-agent: openseo-reports\nDisallow: /pricing",
      ),
  );
  pages.set("https://example.com/private", () => html("open to us"));
  const report = run();
  expect(await readPage("https://example.com/pricing", report)).toMatch(
    /robots\.txt/,
  );
  expect(await readPage("https://example.com/private", report)).toMatch(
    /open to us/,
  );
  // One robots.txt request for the whole report.
  expect(requested().filter((url) => url.endsWith("/robots.txt"))).toHaveLength(
    1,
  );
});

it("leaves a site alone when its robots.txt can't be read", async () => {
  pages.set(
    "https://example.com/robots.txt",
    () => new Response("", { status: 503 }),
  );
  pages.set("https://example.com/", () => html("hello"));
  expect(await readPage("https://example.com/", run())).toMatch(/^Refused/);
  expect(requested()).toEqual(["https://example.com/robots.txt"]);
});

it("refuses anything that isn't text", async () => {
  pages.set(
    "https://example.com/logo.png",
    () => new Response("png", { headers: { "Content-Type": "image/png" } }),
  );
  expect(await readPage("https://example.com/logo.png", run())).toMatch(
    /not text/,
  );
});

it("stops reading a large page and hands the model a bounded length", async () => {
  let chunks = 0;
  pages.set(
    "https://example.com/huge",
    () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            chunks += 1;
            controller.enqueue(new TextEncoder().encode("a".repeat(500_000)));
          },
        }),
        { headers: { "Content-Type": "text/plain" } },
      ),
  );
  const text = await readPage("https://example.com/huge", run());
  expect(text.length).toBeLessThan(31_000);
  expect(chunks).toBeLessThan(8);
});

it("leaves a site alone when its robots.txt says to slow down, or lists more rules than can be checked cheaply", async () => {
  pages.set("https://example.com/", () => html("hello"));
  pages.set(
    "https://example.com/robots.txt",
    () => new Response("", { status: 429 }),
  );
  expect(await readPage("https://example.com/", run())).toMatch(/robots\.txt/);
  pages.set(
    "https://example.com/robots.txt",
    () =>
      new Response(`User-agent: *\n${"Disallow: /private/a\n".repeat(5_001)}`),
  );
  expect(await readPage("https://example.com/", run())).toMatch(/robots\.txt/);
  expect(requested()).not.toContain("https://example.com/");
});

it("refuses an address too long to be a page, typed or redirected to", async () => {
  const long = `https://example.com/${"a".repeat(2_000)}`;
  expect(await readPage(long, run())).toMatch(/^Refused/);
  expect(fetchMock).not.toHaveBeenCalled();
  pages.set(
    "https://example.com/short",
    () => new Response(null, { status: 302, headers: { Location: long } }),
  );
  expect(await readPage("https://example.com/short", run())).toMatch(
    /^Refused/,
  );
  expect(requested()).not.toContain(long);
});

it("isn't slowed by a page or a robots.txt written to be slow to parse", async () => {
  // As many rules as a robots.txt may have, each with many wildcards,
  // against addresses as long as one may be that almost match.
  const rule = `Disallow: /${"*a".repeat(12)}b\n`;
  pages.set(
    "https://example.com/robots.txt",
    () => new Response(`User-agent: *\n${rule.repeat(5_000)}`),
  );
  const openers = ["<!--", "<a ", "<script "];
  const address = (name: string | number) =>
    `https://example.com/${name}${"a".repeat(1_900)}`;
  for (const [index, opener] of openers.entries()) {
    // Each page is reached through three redirects, each checked in turn.
    for (const hop of [0, 1, 2])
      pages.set(
        address(`${index}-${hop}`),
        () =>
          new Response(null, {
            status: 302,
            headers: { Location: address(`${index}-${hop + 1}`) },
          }),
      );
    pages.set(address(`${index}-3`), () =>
      html(opener.repeat(2_000_000 / opener.length)),
    );
  }
  const report = run();
  const started = performance.now();
  for (const index of openers.keys())
    expect(await readPage(address(`${index}-0`), report)).not.toMatch(
      /^Refused/,
    );
  expect(performance.now() - started).toBeLessThan(2_000);
});

it("doesn't count the time a robots.txt takes against the page, and does count every redirect", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const taking = (seconds: number, answer: () => Response) => () => {
    vi.setSystemTime(Date.now() + seconds * 1000);
    return answer();
  };
  pages.set(
    "https://example.com/robots.txt",
    taking(9, () => new Response("")),
  );
  pages.set(
    "https://example.com/a",
    taking(
      4,
      () => new Response(null, { status: 302, headers: { Location: "/b" } }),
    ),
  );
  pages.set(
    "https://example.com/b",
    taking(4, () => html("the page")),
  );
  expect(await readPage("https://example.com/a", run())).toMatch(/the page$/);
  // Three redirects of four seconds each are past the page's ten.
  pages.set(
    "https://example.com/b",
    taking(
      4,
      () => new Response(null, { status: 302, headers: { Location: "/c" } }),
    ),
  );
  pages.set(
    "https://example.com/c",
    taking(
      4,
      () => new Response(null, { status: 302, headers: { Location: "/d" } }),
    ),
  );
  pages.set("https://example.com/d", () => html("too late"));
  expect(await readPage("https://example.com/a", run())).toMatch(
    /did not answer/,
  );
  vi.useRealTimers();
});

it("leaves a character reference that names no character as it is", async () => {
  pages.set("https://example.com/", () => html("&#99999999; fine"));
  expect(await readPage("https://example.com/", run())).toMatch(
    /&#99999999; fine$/,
  );
});
