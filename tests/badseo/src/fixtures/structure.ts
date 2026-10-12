import type { Fixture } from "./types";
import { htmlResponse, renderPage, renderDocument, escapeHtml } from "../lib";
import { article } from "./helpers";

const CAT = "Site structure";

// 25 — orphan page: in the sitemap, but nothing links to it ---------------
const orphan: Fixture = {
  path: "/structure/orphan",
  category: CAT,
  name: "Orphan page",
  summary: "Only reachable through the sitemap. No internal link points to it.",
  lesson:
    "A page with no internal links gets little crawl attention and no internal link strength, and people cannot reach it by browsing. Link to it from somewhere relevant.",
  expectedIssues: ["orphan-page"],
  // The point of the page: it is in the sitemap, but nothing links to it.
  linkedFromCatalog: false,
  inSitemap: true,
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: orphan,
        title: "An orphan page",
        metaDescription:
          "A normal page that no other page on the site links to. It is only reachable because it is listed in the sitemap.",
        bodyHtml: article({
          h1: "A page nothing links to",
          lede: "This page is fine. No other page on the site links to it.",
          sections: [
            {
              h2: "What makes a page an orphan",
              body: "An orphan page has no internal links pointing at it. You can still reach it if you know the URL, and it may be in the sitemap, but there is no path to it by clicking around the site. Search engines lean on internal links to find pages and to pass strength between them, so an orphan gets crawled rarely and ranks weakly, however good it is.",
            },
            {
              h2: "How pages get orphaned",
              body: "It usually happens by accident. A page is removed from a menu but the URL stays live, a campaign landing page loses its links when the campaign ends, or a bulk import creates pages that were never added to navigation. The fix is to link to the page from somewhere relevant, like a hub page, a related article, or the main navigation, so both crawlers and people can find it.",
            },
          ],
        }),
      }),
    ),
};

// 26 — no outgoing links ---------------------------------------------------
const noOutgoingLinks: Fixture = {
  path: "/structure/no-outgoing-links",
  category: CAT,
  name: "No outgoing links",
  summary: "The page is otherwise healthy, but contains zero anchor links.",
  lesson:
    "A page with no outgoing links is a dead end for crawlers and people. Link onward to related content, a parent category, or the homepage.",
  expectedIssues: ["no-outgoing-links"],
  handler: () =>
    htmlResponse(
      renderDocument({
        title: "Page with no outgoing links",
        metaDescription:
          "This healthy page deliberately renders no anchor tags, so crawlers and users reach a dead end.",
        bodyHtml: `<main class="main">
${article({
  h1: "A page with no outgoing links",
  lede: "Everything on this page is healthy except the complete lack of links.",
  sections: [
    {
      h2: "Why dead ends are a problem",
      body: "Search crawlers move through a site by following links. When a page has no outgoing links, any link strength that reaches it stops there, and a crawler has no next page to discover from this point. People hit the same problem when they finish reading and have nowhere useful to go except the browser back button.",
    },
    {
      h2: "What a healthy page should do",
      body: "Most pages should point somewhere sensible after the main content: a related article, a parent category, the homepage, or the next step in a flow. The exact destination depends on the page, but the pattern is the same. A useful page should help visitors continue, and it should help crawlers understand how this URL fits into the wider site instead of treating the page as an isolated endpoint.",
    },
  ],
})}
</main>`,
      }),
    ),
};

// 27 — deep pages: a click-chain 5+ levels from the homepage --------------
// catalog(1) -> deep/1(2) -> deep/2(3) -> deep/3(4) -> deep/4(5) -> treasure(6).
// Only deep/1 is linked from the catalog; each level links onward in its body,
// so the chain is the ONLY way down. Pages at depth >= 5 trip deep-page.
function deepWaypoint(level: number, next: string): Fixture {
  const fx: Fixture = {
    path: `/structure/deep/${level}`,
    category: CAT,
    name: `Deep click-path, level ${level}`,
    summary: `Step ${level} of a long click-chain that leaves a page many clicks deep.`,
    lesson:
      "Pages many clicks from the homepage get crawled less and get less link strength. Flatten the path with links from higher-level pages.",
    expectedIssues: [],
    support: true,
    linkedFromCatalog: level === 1, // only the entrance is on the catalog
    inSitemap: false,
    handler: () =>
      htmlResponse(
        renderPage({
          fixture: fx,
          title: `Deep click-path, level ${level}`,
          metaDescription: `Level ${level} of a deliberately deep click-path. The only way on is the single link at the bottom of the page.`,
          bodyHtml: `${article({
            h1: `You are ${level} click${level === 1 ? "" : "s"} deep`,
            lede: `The buried page is further down than it should be. Keep going.`,
            sections: [
              {
                h2: "Why click-depth matters",
                body: "Search engines spend more crawl budget on pages close to the homepage and less on pages behind many clicks. Depth is a rough measure of importance. If it takes six clicks to reach a page, the site's own structure is saying the page barely matters. Content you care about should not be that far down.",
              },
              {
                h2: "The only way on",
                body: "This page exists to add one more level of depth to the chain. There is exactly one link forward, below, and no shortcut from anywhere closer to the top. That is how a real site can leave an important page buried behind a single narrow trail of links.",
              },
            ],
          })}
<p class="next"><a href="${escapeHtml(next)}">Go to the next level down</a></p>`,
        }),
      ),
  };
  return fx;
}

const treasure: Fixture = {
  path: "/structure/deep/treasure",
  category: CAT,
  name: "Deep page (6 clicks down)",
  summary: "Sits 6 clicks from the homepage, at the end of the click-chain.",
  lesson:
    "A page this deep is crawled rarely and gets almost no link strength. If it matters, link to it from much closer to the top.",
  expectedIssues: ["deep-page"],
  linkedFromCatalog: false,
  inSitemap: false,
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: treasure,
        title: "The deeply buried page",
        metaDescription:
          "This page sits six clicks from the homepage, which is why search engines rarely reach it.",
        bodyHtml: article({
          h1: "A page buried six clicks deep",
          lede: "You reached this in six clicks. A crawler would likely have stopped before now.",
          sections: [
            {
              h2: "This far down, ranking is hard",
              body: "This page sits five or more clicks from the homepage. That is deep enough that crawlers visit it rarely and pass it very little internal strength. If this were a product, an article, or a landing page you cared about, its position this far down would cap how well it can do.",
            },
            {
              h2: "How to fix a buried page",
              body: "The fix is not to delete the pages in between. It is to add shortcuts. Link to important deep pages straight from hubs, category pages, or the main navigation, so they sit two or three clicks from home instead of six. A flatter structure tells search engines the page matters and gives it a real chance to rank.",
            },
          ],
        }),
      }),
    ),
};

const deep1 = deepWaypoint(1, "/structure/deep/2");
const deep2 = deepWaypoint(2, "/structure/deep/3");
const deep3 = deepWaypoint(3, "/structure/deep/4");
const deep4 = deepWaypoint(4, "/structure/deep/treasure");

export const structureFixtures: Fixture[] = [
  orphan,
  noOutgoingLinks,
  deep1,
  deep2,
  deep3,
  deep4,
  treasure,
];
