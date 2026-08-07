import { load } from "cheerio";
import robotsParser from "robots-parser";
import { z } from "zod";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  startUrl: z.string().url(),
  maxPages: z.number().int().min(1).max(500).optional(),
  maxDepth: z.number().int().min(0).max(10).optional(),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// Blocks loopback/link-local/RFC1918/unique-local literals so a caller (or an
// attacker-controlled redirect) can't point the crawler at internal
// infrastructure or cloud metadata endpoints (169.254.169.254).
// ponytail: literal-IP denylist only, no DNS resolution (edge runtime has no
// dns module) — a hostname that resolves to a private IP at fetch time still
// gets through. Upgrade path: route fetches through a resolving egress proxy
// if that residual DNS-rebinding gap ever needs closing.
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}
type Page = {
  url: string;
  depth: number;
  status: number;
  finalUrl: string;
  redirectChain: string[];
  title: string;
  description: string;
  canonical: string;
  h1Count: number;
  hreflangs: number;
  links: string[];
};
type Finding = {
  type: string;
  severity: "error" | "warning" | "info";
  url: string;
  details: string;
  target?: string;
};

function normalizeUrl(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isBlockedHost(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchPage(
  url: string,
): Promise<{ response: Response; chain: string[] }> {
  const chain: string[] = [];
  let current = url;
  for (let i = 0; i < 10; i++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "OpenSEO-Crawler/1.0 (+https://openseo.so)" },
    });
    chain.push(current);
    if (![301, 302, 303, 307, 308].includes(response.status))
      return { response, chain };
    const location = response.headers.get("location");
    if (!location) return { response, chain };
    const next = normalizeUrl(location, current);
    if (!next) return { response, chain };
    current = next;
  }
  return { response: await fetch(current), chain };
}

function analyzePage(
  page: Page,
  chain: string[],
  body: string,
  links: string[],
  ctx: {
    item: { url: string; depth: number };
    maxDepth: number;
    maxPages: number;
    queue: { url: string; depth: number }[];
    queued: Set<string>;
    pages: Map<string, Page>;
  },
): Finding[] {
  const { item } = ctx;
  const findings: Finding[] = [];
  if (page.status >= 400)
    findings.push({
      type: "http_error",
      severity: "error",
      url: item.url,
      details: `HTTP ${page.status}`,
    });
  if (chain.length > 1)
    findings.push({
      type: "redirect_chain",
      severity: "warning",
      url: item.url,
      details: `${chain.length - 1} redirect(s) before the final response`,
      target: chain[chain.length - 1],
    });
  if (!body) return findings;
  if (!page.title)
    findings.push({
      type: "missing_title",
      severity: "error",
      url: item.url,
      details: "Page has no title tag.",
    });
  if (!page.description)
    findings.push({
      type: "missing_meta_description",
      severity: "warning",
      url: item.url,
      details: "Page has no meta description.",
    });
  if (!page.canonical)
    findings.push({
      type: "missing_canonical",
      severity: "warning",
      url: item.url,
      details: "Page has no canonical link.",
    });
  else if (!normalizeUrl(page.canonical, item.url))
    findings.push({
      type: "broken_canonical",
      severity: "error",
      url: item.url,
      details: "Canonical is not a valid HTTP(S) URL.",
      target: page.canonical,
    });
  if (page.h1Count === 0)
    findings.push({
      type: "missing_h1",
      severity: "warning",
      url: item.url,
      details: "Page has no H1 heading.",
    });
  if (page.hreflangs === 0)
    findings.push({
      type: "missing_hreflang",
      severity: "info",
      url: item.url,
      details: "Page has no hreflang annotations.",
    });
  if (item.depth < ctx.maxDepth)
    for (const link of links)
      if (!ctx.queued.has(link) && ctx.pages.size + ctx.queue.length < ctx.maxPages) {
        ctx.queued.add(link);
        ctx.queue.push({ url: link, depth: item.depth + 1 });
      }
  return findings;
}

export const crawlAuditTool = {
  name: "crawl_audit",
  config: {
    title: "Crawl site for technical SEO issues",
    description:
      "Crawl a site with robots.txt, depth, and page caps. Reports structured technical SEO findings: broken links, title/meta/canonical/H1/hreflang issues, duplicate titles, orphan pages, redirect chains, and status errors.",
    inputSchema,
    outputSchema: z
      .object({
        ok: z.boolean(),
        startUrl: z.string(),
        pagesCrawled: z.number(),
        findings: z
          .array(
            z.object({
              type: z.string(),
              severity: z.string(),
              url: z.string(),
              details: z.string(),
              target: z.string().optional(),
            }),
          )
          .optional(),
        pages: z.array(z.record(z.string(), z.unknown())).optional(),
        error: z.string().optional(),
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args) => {
    const start = normalizeUrl(args.startUrl, args.startUrl);
    if (!start)
      return mcpResponse({
        text: "Invalid start URL.",
        structuredContent: {
          ok: false,
          startUrl: args.startUrl,
          pagesCrawled: 0,
          error: "invalid_url",
        },
      });
    const startOrigin = new URL(start).origin;
    const maxPages = args.maxPages ?? 50;
    const maxDepth = args.maxDepth ?? 3;
    const findings: Finding[] = [];
    const pages = new Map<string, Page>();
    const inbound = new Map<string, number>();
    const queue = [{ url: start, depth: 0 }];
    const queued = new Set([start]);
    let robots = robotsParser(`${startOrigin}/robots.txt`, "");
    try {
      const response = await fetch(`${startOrigin}/robots.txt`, {
        headers: { "User-Agent": "OpenSEO-Crawler/1.0" },
      });
      if (response.ok)
        robots = robotsParser(
          `${startOrigin}/robots.txt`,
          await response.text(),
        );
    } catch {
      /* robots unavailable: continue conservatively */
    }
    while (queue.length > 0 && pages.size < maxPages) {
      const item = queue.shift();
      if (!item || !robots.isAllowed(item.url, "OpenSEO-Crawler")) continue;
      try {
        const { response, chain } = await fetchPage(item.url);
        const finalUrl = chain[chain.length - 1] ?? item.url;
        const body = response.headers.get("content-type")?.includes("text/html")
          ? await response.text()
          : "";
        const $ = load(body);
        const links = body
          ? $("a[href]")
              .map((_i, element) =>
                normalizeUrl($(element).attr("href") ?? "", startOrigin),
              )
              .get()
              .filter(
                (value): value is string =>
                  Boolean(value) && new URL(value).origin === startOrigin,
              )
          : [];
        for (const link of links)
          inbound.set(link, (inbound.get(link) ?? 0) + 1);
        const page: Page = {
          url: item.url,
          depth: item.depth,
          status: response.status,
          finalUrl,
          redirectChain: chain,
          title: $("title").first().text().trim(),
          description:
            $("meta[name='description']").attr("content")?.trim() ?? "",
          canonical: $("link[rel='canonical']").attr("href")?.trim() ?? "",
          h1Count: $("h1").length,
          hreflangs: $("link[rel='alternate'][hreflang]").length,
          links,
        };
        pages.set(item.url, page);
        findings.push(...analyzePage(page, chain, body, links, { item, maxDepth, maxPages, queue, queued, pages }));
      } catch (error) {
        findings.push({
          type: "crawl_error",
          severity: "error",
          url: item.url,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const titles = new Map<string, string[]>();
    for (const page of pages.values())
      if (page.title)
        titles.set(page.title, [...(titles.get(page.title) ?? []), page.url]);
    for (const [title, urls] of titles)
      if (urls.length > 1)
        for (const url of urls)
          findings.push({
            type: "duplicate_title",
            severity: "warning",
            url,
            details: `Title is shared by ${urls.length} pages: ${title}`,
          });
    for (const [url, _page] of pages)
      if (url !== start && (inbound.get(url) ?? 0) === 0)
        findings.push({
          type: "orphan_page",
          severity: "warning",
          url,
          details: "No crawled page links to this URL.",
        });
    const summary = `Crawled ${pages.size} page(s) on ${startOrigin}; found ${findings.length} finding(s).`;
    return mcpResponse({
      text: summary,
      structuredContent: {
        ok: true,
        startUrl: start,
        pagesCrawled: pages.size,
        findings,
        pages: [...pages.values()],
      },
    });
  }),
};
