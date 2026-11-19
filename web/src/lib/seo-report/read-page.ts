import { robotsRules, rulesAllow, type RobotsRules } from "./robots";
import { within } from "./links";
import { reportSite } from "./site";

// How a report reads a page of the site it is about. The Worker fetches it
// directly, as a crawler that says who it is and does what it is told:
//
// - Only the report's own site: its name and names under it.
// - Only a public web address: http or https, a public name, no credentials
//   or port. This checks names, not the addresses they resolve to. Where a
//   request to a name goes is Cloudflare's network's doing, and a Worker has
//   no private network of ours to reach.
// - Only a page the site's robots.txt lets this crawler read.
//
// All three are checked again for every redirect, before it is followed.
//
// The `global_fetch_strictly_public` flag in wrangler.jsonc makes these
// requests travel as any request on the public Internet does: one to a site
// on this Cloudflare account, this one included, comes in through
// Cloudflare's front door with its security settings applied.

/** This crawler's name, as a site would write it in robots.txt. */
const ROBOTS_AGENT = "openseo-reports";
const USER_AGENT = "OpenSEO-Reports/1.0 (+https://openseo.so/seo-report)";
/** For one page, redirects and body included. A robots.txt has as long again of its own. */
const FETCH_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;
/** As much of a robots.txt as Google reads. */
const MAX_ROBOTS_BYTES = 500_000;
// A site chooses where its redirects go, and every robots.txt rule is tried
// against the whole address. Longer than any page worth reading.
const MAX_ADDRESS_CHARACTERS = 2_000;
// Ten times what is kept. Parsing more only spends the Worker's CPU allowance.
const MAX_HTML_CHARACTERS = 300_000;
const MAX_CHARACTERS = 30_000;

/** Why a page wasn't read, in words for the model. */
enum Refused {
  NotPublic = "Refused: that is not a public web address.",
  OffSite = "Refused: only pages of the report's own site can be read.",
  Robots = "Refused: the site's robots.txt asks us not to read this page.",
  Redirects = "Refused: the page redirects too many times.",
  NoAnswer = "Refused: the site did not answer.",
}

/**
 * Each origin's robots.txt, fetched and parsed once per report: its rules
 * for this crawler (none when the site has no robots.txt), or null when it
 * couldn't be read.
 */
export type RobotsCache = Map<string, Promise<RobotsRules | null>>;

/** The address when it is one a report may request, else why not. */
function sitePage(address: string, site: string, base?: URL): URL | Refused {
  let url: URL;
  try {
    url = new URL(address, base);
  } catch {
    return Refused.NotPublic;
  }
  if (url.href.length > MAX_ADDRESS_CHARACTERS) return Refused.NotPublic;
  const host = /^https?:$/.test(url.protocol) ? reportSite(url.href) : null;
  if (!host) return Refused.NotPublic;
  return within(host, site) ? url : Refused.OffSite;
}

/**
 * Requests `start` and follows its redirects within the site. `mayRead` is
 * asked about every address before it is requested; the time it takes (a
 * robots.txt being fetched) isn't the page's. The answer's body can still be
 * read for what is left of `ms`.
 */
async function follow(
  start: URL,
  site: string,
  ms: number,
  mayRead: (url: URL) => Promise<boolean>,
): Promise<{ response: Response; url: URL } | Refused> {
  let url = start;
  let left = ms;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await mayRead(url))) return Refused.Robots;
    const asked = Date.now();
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.8" },
      redirect: "manual",
      signal: AbortSignal.timeout(left),
    });
    const location = response.headers.get("Location");
    if (response.status < 300 || response.status >= 400 || !location)
      return { response, url };
    const next = sitePage(location, site, url);
    if (typeof next === "string") return next;
    left -= Date.now() - asked;
    if (left <= 0) return Refused.NoAnswer;
    url = next;
  }
  return Refused.Redirects;
}

/** The body as text, read no further than `most` bytes. */
async function boundedText(response: Response, most: number): Promise<string> {
  if (!response.body) return "";
  const reader: ReadableStreamDefaultReader<Uint8Array> =
    response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (bytes < most) {
    const { done, value } = await reader.read();
    if (done) break;
    const kept = value.subarray(0, most - bytes);
    bytes += kept.byteLength;
    text += decoder.decode(kept, { stream: true });
  }
  await reader.cancel();
  return text;
}

// As crawlers agree to read it: a site with no robots.txt (a 4xx other than
// "too many requests") allows everything, and one whose robots.txt can't be
// read (a server error, a 429, no answer, or more rules than can be checked
// cheaply) is left alone.
async function robotsFor(
  origin: string,
  site: string,
): Promise<RobotsRules | null> {
  try {
    const robots = new URL("/robots.txt", origin);
    const found = await follow(robots, site, FETCH_MS, async () => true);
    if (typeof found === "string") return null;
    const { status, ok } = found.response;
    if (status >= 500 || status === 429) return null;
    if (!ok) return [];
    return robotsRules(
      await boundedText(found.response, MAX_ROBOTS_BYTES),
      ROBOTS_AGENT,
    );
  } catch {
    return null;
  }
}

async function robotsAllow(url: URL, site: string, cache: RobotsCache) {
  let rules = cache.get(url.origin);
  if (!rules) {
    rules = robotsFor(url.origin, site);
    cache.set(url.origin, rules);
  }
  const ours = await rules;
  return ours !== null && rulesAllow(ours, url.pathname + url.search);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
// Their text isn't something a person reads on the page.
const UNREAD = ["script", "style", "noscript", "svg", "template"];
// Closing one of these, or a <br>, ends a line.
const LINE_END = /^(\/(p|div|section|article|li|tr|h[1-6]|header|footer)|br)$/;

/** `&name;`, `&#12;` or `&#xc;` as the character it stands for, or itself when it stands for none. */
function character(entity: string, name: string) {
  if (!name.startsWith("#")) return ENTITIES[name.toLowerCase()] ?? entity;
  const code = /^#x/i.test(name)
    ? Number.parseInt(name.slice(2), 16)
    : Number(name.slice(1));
  return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

/**
 * What a person would read on the page: no scripts, styles or markup. It
 * walks the page once from left to right, so a page built to be slow to
 * parse (ten thousand comments that never close, say) costs no more than
 * any other page of its length.
 */
function htmlToText(page: string): string {
  let html = page.slice(0, MAX_HTML_CHARACTERS);
  let lower = html.toLowerCase();
  // A few letters change length in lower case, which would move every
  // position after them. Then the lower-case page is the one that is read.
  if (lower.length !== html.length) html = lower = lower.toLowerCase();
  let text = "";
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf("<", at);
    if (open === -1) {
      text += html.slice(at);
      break;
    }
    text += html.slice(at, open);
    // From here to `end` is markup. Markup that never closes ends the text.
    let end: number;
    let gap = " ";
    const comment = lower.startsWith("<!--", open);
    if (comment) {
      end = lower.indexOf("-->", open + 4);
    } else {
      end = html.indexOf(">", open + 1);
      const tag = /^<(\/?[a-z][a-z0-9]*)/.exec(lower.slice(open, open + 16));
      const name = tag?.[1] ?? "";
      if (LINE_END.test(name)) gap = "\n";
      if (end !== -1 && UNREAD.includes(name)) {
        const close = lower.indexOf(`</${name}`, end);
        end = close === -1 ? -1 : lower.indexOf(">", close);
      }
    }
    if (end === -1) break;
    text += gap;
    at = comment ? end + 3 : end + 1;
  }
  return text
    .replace(/&(#\d{1,8}|#x[\da-f]{1,6}|[a-z]{1,10});/gi, character)
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A page's text, or a sitemap's or feed's XML, cut to a length a model can
 * read. A page that can't be read comes back as a sentence saying so, which
 * the model is told to treat as a refusal.
 */
export async function readPage(
  address: string,
  run: { site: string; robots: RobotsCache },
): Promise<string> {
  const start = sitePage(address, run.site);
  if (typeof start === "string") return start;
  try {
    const found = await follow(start, run.site, FETCH_MS, (url) =>
      robotsAllow(url, run.site, run.robots),
    );
    if (typeof found === "string") return found;
    const { response, url } = found;
    if (!response.ok) return `Refused: the site answered ${response.status}.`;
    const type = response.headers.get("Content-Type") ?? "";
    if (!/html|xml|text\/plain/i.test(type))
      return `Refused: the page is ${type || "an unknown type"}, not text.`;
    const body = await boundedText(response, MAX_BYTES);
    const text = /html/i.test(type) ? htmlToText(body) : body;
    return `${url.href}\n\n${text.slice(0, MAX_CHARACTERS)}`;
  } catch {
    return Refused.NoAnswer;
  }
}
