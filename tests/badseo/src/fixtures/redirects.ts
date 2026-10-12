import type { Fixture } from "./types";
import { redirect, htmlResponse, renderPage } from "../lib";
import { article } from "./helpers";

const CAT = "Redirects";

/**
 * Canonical path for the trailing-slash fixture. The SLASH form is the
 * canonical 200; the non-slash form 301-redirects to it (see the intercept in
 * index.ts). Exported so the Worker and the fixture agree on the path.
 */
export const TRAILING_SLASH_CANONICAL = "/redirect/trailing-slash";

// 22 — redirect chain: /chain-1 -> /chain-2 -> / (homepage) ----------------
// Two hops before content is a chain. The crawler records each hop as its own
// row and flags the head of the chain.
const redirectChain: Fixture = {
  path: "/redirect/chain-1",
  category: CAT,
  name: "Redirect chain (3 hops)",
  summary:
    "/redirect/chain-1 redirects to chain-2, which redirects to the homepage. Two hops to reach content.",
  lesson:
    "Every extra hop adds a little delay, loses a little link strength, and uses crawl budget. Point the first URL straight at the final page.",
  expectedIssues: ["redirect-chain"],
  inSitemap: false,
  handler: () => redirect("/redirect/chain-2", 301),
};

// Support: the middle hop. Not featured anywhere; found via chain-1.
const redirectChainMid: Fixture = {
  path: "/redirect/chain-2",
  category: CAT,
  name: "Redirect chain (middle hop)",
  summary: "The middle of the redirect chain. Redirects on to the homepage.",
  lesson: "",
  expectedIssues: [],
  support: true,
  linkedFromCatalog: false,
  inSitemap: false,
  handler: () => redirect("/", 301),
};

// 23 — redirect loop: a URL that redirects to itself ----------------------
const redirectLoop: Fixture = {
  path: "/redirect/loop",
  category: CAT,
  name: "Redirect loop",
  summary: "/redirect/loop redirects to itself, so it never resolves.",
  lesson:
    "A redirect that points back to itself never reaches a real page. Browsers and crawlers give up with an error.",
  expectedIssues: ["redirect-loop"],
  inSitemap: false,
  // Location resolves to this same URL, a self-redirect the crawler can never
  // satisfy, which is a redirect loop.
  handler: () => redirect("/redirect/loop", 302),
};

// 24 — trailing-slash canonical (redirect-cycle trap) ---------------------
// The canonical URL ends in a slash (/redirect/trailing-slash/ = 200); the
// non-slash form 301-redirects to it, exactly like WordPress and most CMSes.
// A crawler that normalizes away trailing slashes turns /redirect/trailing-slash/
// back into /redirect/trailing-slash, follows the 301 to the slash form, strips
// it again, and loops — the 508 "Loop Detected" class of bug from
// https://github.com/every-app/open-seo/pull/61. The audit must crawl the
// canonical page once as a 200 and NOT report a redirect loop, so this fixture
// expects zero issues. If it ever comes back with redirect-loop (or an error),
// the trailing-slash handling has regressed.
const trailingSlashCanonical: Fixture = {
  path: TRAILING_SLASH_CANONICAL,
  category: CAT,
  name: "Trailing-slash canonical (redirect-cycle trap)",
  summary:
    "The canonical URL ends in a slash; the non-slash form 301-redirects to it, like WordPress. This page is correct — it's a trap for crawlers that strip trailing slashes.",
  lesson:
    "A crawler that normalizes /foo/ to /foo will follow the 301 back to /foo/, strip it again, and loop forever (508 Loop Detected). The audit must crawl the canonical page once as a 200 and not report a false redirect loop.",
  expectedIssues: [],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: trailingSlashCanonical,
        title: "Trailing-slash canonical page",
        metaDescription:
          "The canonical version of this page ends in a trailing slash, and the non-slash form redirects to it, which trips up crawlers that strip slashes.",
        bodyHtml: article({
          h1: "This is the canonical, trailing-slash version",
          lede: "You reached this via a 301 from the non-slash URL. That is normal, and a crawler must handle it without looping.",
          sections: [
            {
              h2: "Why the trailing slash matters",
              body: "Most content management systems treat the trailing-slash form of a URL as canonical and 301-redirect the non-slash form to it. So /services and /services/ are not two pages; one is a permanent redirect to the other. This is correct behaviour, and every crawler has to deal with it.",
            },
            {
              h2: "Where crawlers go wrong",
              body: "A crawler that quietly strips trailing slashes to deduplicate URLs turns the canonical /services/ back into /services, fetches it, gets a 301 to /services/, strips the slash again, and queues /services once more. That cycle repeats until a loop detector gives up with a 508. The fix is to preserve the trailing slash, or to follow the redirect to the canonical form and mark it visited, so the page is crawled once and never re-queued.",
            },
          ],
        }),
      }),
    ),
};

export const redirectFixtures: Fixture[] = [
  redirectChain,
  redirectChainMid,
  redirectLoop,
  trailingSlashCanonical,
];
