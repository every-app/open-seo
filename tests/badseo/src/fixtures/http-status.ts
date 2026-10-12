import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";
import { article } from "./helpers";

const CAT = "HTTP status & links";

/** 429s answered before a request is let through; the served request resets it. */
const RATE_LIMIT_REFUSALS = 2;
let refusals = 0;

function stillRateLimited(): boolean {
  refusals += 1;
  if (refusals <= RATE_LIMIT_REFUSALS) return true;
  refusals = 0;
  return false;
}

// 18 — a URL that returns 404 (discovered via sitemap) --------------------
const notFound: Fixture = {
  path: "/status/not-found",
  category: CAT,
  name: "Page returns 404",
  summary: "Listed in the sitemap, but responds 404 Not Found.",
  lesson:
    "A dead URL in your sitemap wastes crawl budget on every visit. Remove it, restore the page, or redirect it to a real one.",
  expectedIssues: ["broken-page"],
  // The sitemap lists it, so a crawler finds a dead URL. Kept off the catalog
  // so the catalog itself does not earn a broken-internal-link.
  linkedFromCatalog: false,
  inSitemap: true,
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: notFound,
        title: "404, this page does not exist",
        metaDescription: "A URL that is listed in the sitemap but returns 404.",
        bodyHtml: article({
          h1: "404, but the sitemap still lists it",
          lede: "The sitemap says this page exists. The server returns 404.",
          sections: [
            {
              h2: "Why a 404 in the sitemap is a problem",
              body: "A sitemap is a list of pages you are telling search engines to go crawl. When one of those URLs returns 404, you spend crawl budget fetching nothing and keep pointing the crawler at a page that is not there. On a large site, thousands of these add up.",
            },
            {
              h2: "The fix",
              body: "If the page should exist, restore it. If it is gone for good, take it out of the sitemap and out of any internal links, and if something replaced it, add a 301 to that page. What you do not want is to leave it in the sitemap, telling crawlers to keep visiting a URL that no longer works.",
            },
          ],
        }),
      }),
      { status: 404 },
    ),
};

// 19 — a URL that returns 500 --------------------------------------------
const serverError: Fixture = {
  path: "/status/server-error",
  category: CAT,
  name: "Server error (500)",
  summary: "Responds 500 Internal Server Error instead of a page.",
  lesson:
    "Repeated 5xx errors make search engines crawl a site less and can drop pages from the index. A missing page should return 404, not 500.",
  expectedIssues: ["server-error"],
  linkedFromCatalog: false,
  inSitemap: true,
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: serverError,
        title: "500, the server errored",
        metaDescription: "A URL that returns a 500 error to every crawler.",
        bodyHtml: article({
          h1: "500, a server error",
          lede: "This URL does not return 404. It returns a 500 every time.",
          sections: [
            {
              h2: "5xx is worse than 4xx",
              body: "A 404 says the page is not here. A 500 says the server itself failed while trying to answer. Search engines treat repeated 5xx errors as a sign the site is unhealthy and respond by slowing their crawl. Do it often enough and pages start dropping out of the index.",
            },
            {
              h2: "Return the right code",
              body: "If content is gone, return a 404 or 410 so the search engine can update its records. Keep 500s for actual, unexpected failures, and then read the logs and fix them. A route that returns 500 every time is not an error page, it is a bug.",
            },
          ],
        }),
      }),
      { status: 500 },
    ),
};

// 20 — bot challenge / access denied (403) --------------------------------
const blocked: Fixture = {
  path: "/status/blocked",
  category: CAT,
  name: "Crawler blocked (403)",
  summary: 'Returns 403 Forbidden. The honest "we could not read this" case.',
  lesson:
    "A 403 or a bot challenge means the crawler was blocked. A good audit says so, instead of reporting the page as broken. Real search bots may hit the same wall.",
  expectedIssues: ["blocked-page"],
  linkedFromCatalog: false,
  inSitemap: true,
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: blocked,
        title: "403, the crawler was blocked",
        metaDescription: "A page that returns 403 Forbidden to crawlers.",
        bodyHtml: article({
          h1: "403, access denied to the crawler",
          lede: "Aggressive bot protection can block the good crawlers along with the bad ones.",
          sections: [
            {
              h2: "Blocked is not the same as broken",
              body: "When a page answers a crawler with 403 or a challenge screen, the honest conclusion is not that the page is broken. It is that the crawler was not allowed to see it. A good audit says exactly that. Reporting a blocked page as a content problem would send you looking for a bug that is not there, when the real issue is access.",
            },
            {
              h2: "When your own protection backfires",
              body: "Strict WAF rules and bot-fight modes often catch real crawlers in the same net as scrapers. If search engines or your own audit keep getting blocked, allowlist their user agents so they can read the site. A page nobody can crawl is a page that cannot rank, however good the content behind the wall is.",
            },
          ],
        }),
      }),
      { status: 403 },
    ),
};

// 21 — a healthy page that links to the 404 above -------------------------
const brokenInternalLink: Fixture = {
  path: "/links/broken-internal-link",
  category: CAT,
  name: "Broken internal link",
  summary: "Links to /status/not-found, which returns 404.",
  lesson:
    "Linking to your own dead URLs frustrates people, wastes crawl budget, and sends link strength nowhere. Fix or remove the link.",
  expectedIssues: ["broken-internal-link"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: brokenInternalLink,
        title: "A page with a broken internal link",
        metaDescription:
          "This page is otherwise fine, but it links to one of its own URLs that returns a 404.",
        bodyHtml: `<h1>The link below goes nowhere</h1>
<p class="lede">This page is fine, except that it links to a page that no longer exists.</p>
<p>Broken internal links are one of the most common and most avoidable technical SEO problems. A person clicks, hits a 404, and leaves. A crawler follows the link, wastes a request, and learns nothing. Any link strength that should have gone to a real page goes into a dead end instead. Unlike a broken external link, this one is entirely yours to fix.</p>
<p>Here is the link, pointing at a URL on this site that returns a 404: <a href="/status/not-found">read our full guide</a>. Click it and you land on a Not Found page, which is what the audit reports when it crawls this link and sees the target return 404.</p>
<h2>How to catch these</h2>
<p>Crawl your own site regularly and check the status of every internal link target. The moment a linked page starts returning 4xx or 5xx, repoint the link to the correct URL or remove it. Do not rely on a redirect to cover it forever; link straight to the page that works.</p>`,
      }),
    ),
};

// 20b — rate limited for the first requests, then served (429 → 200) --------
const rateLimitedThenOk: Fixture = {
  path: "/status/rate-limited",
  category: CAT,
  name: "Rate limited, then served (429)",
  summary: `Answers 429 with Retry-After for the first ${RATE_LIMIT_REFUSALS} requests, then serves the page.`,
  lesson:
    "A 429 means the crawler is going too fast, not that it is unwelcome. A crawler that slows down and comes back gets the page; one that gives up records a page that was never actually broken.",
  // Nothing to report: the audit backs off, retries, and reads the page.
  expectedIssues: [],
  handler: () => {
    const html = renderPage({
      fixture: rateLimitedThenOk,
      title: "Rate limited, then served",
      metaDescription:
        "This URL refuses the first couple of requests with a 429 and a Retry-After header, then serves the page normally.",
      bodyHtml: article({
        h1: "429 first, then the actual page",
        lede: "The first requests to this URL are refused with 429 Too Many Requests. Wait a moment and it answers normally.",
        sections: [
          {
            h2: "429 is a speed limit, not a wall",
            body: "Too Many Requests is the server asking a client to slow down. It is not an access denial and it is not a broken page. Plenty of sites put a rate limit in front of everything, so a crawler that fires twenty parallel requests trips it immediately even though every one of those pages is perfectly healthy and public.",
          },
          {
            h2: "What a well-behaved crawler does",
            body: "It waits. If the response carries a Retry-After header it honours it, otherwise it backs off for a growing delay, and it slows the rest of the crawl down at the same time rather than retrying one URL while hammering the next. Then it asks again. Search engines behave this way too, which is why a site that answers 429 constantly gets crawled less often and sees new pages indexed more slowly.",
          },
          {
            h2: "Why reporting it as blocked is wrong",
            body: "Recording a rate-limited URL as blocked tells the owner to go change their bot protection, which is not the problem. The page is public, the crawler was simply going too fast for it. The honest report is either the page itself, after a retry, or a note that the limit held even after the crawler slowed down.",
          },
        ],
      }),
    });
    return stillRateLimited()
      ? htmlResponse(html, { status: 429, headers: { "retry-after": "1" } })
      : htmlResponse(html);
  },
};

// 20c — rate limited on every request, no Retry-After ----------------------
const rateLimitedAlways: Fixture = {
  path: "/status/rate-limited-always",
  category: CAT,
  name: "Rate limited on every request (429)",
  summary: "Answers 429 to every request, with no Retry-After header.",
  lesson:
    "If a URL still returns 429 after the crawler has slowed down and retried, the page genuinely cannot be audited — but it is rate limited, not blocked, and the fix is the rate limit rather than the bot rules.",
  expectedIssues: ["rate-limited-page"],
  linkedFromCatalog: false,
  inSitemap: true,
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: rateLimitedAlways,
        title: "429 on every single request",
        metaDescription:
          "This URL answers 429 Too Many Requests to every request, no matter how long the crawler waits between them.",
        bodyHtml: article({
          h1: "429, every time",
          lede: "No amount of backing off gets a different answer out of this URL.",
          sections: [
            {
              h2: "When backing off is not enough",
              body: "A crawler should slow down and retry a 429, but it cannot wait forever: a thousand-page audit that pauses a minute per refusal never finishes. After a few spaced-out attempts the honest thing is to record what happened and move on to the rest of the site.",
            },
            {
              h2: "This is a rate limit, not a block",
              body: "The distinction matters because the fixes are different. A blocked page means bot protection decided the crawler was not welcome, and the fix is an allowlist rule. A rate-limited page means the server capped how many requests it will answer, and the fix is a higher limit, an exception for known crawlers, or a smaller crawl. Reporting one as the other sends the site owner into the wrong settings screen.",
            },
            {
              h2: "Search engines see this too",
              body: "Googlebot treats sustained 429s as a signal to crawl less. If a rate limit is strict enough to stop an audit crawler, it is strict enough to slow down how quickly your new and updated pages get discovered and indexed. That makes it worth fixing, not just working around.",
            },
          ],
        }),
      }),
      { status: 429 },
    ),
};

export const httpStatusFixtures: Fixture[] = [
  notFound,
  serverError,
  blocked,
  rateLimitedThenOk,
  rateLimitedAlways,
  brokenInternalLink,
];
