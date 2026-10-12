import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";
import { article } from "./helpers";

const CAT = "Content quality";

// 9 — thin content (< 150 words). The whole document (chrome + panel + body)
// stays under the threshold, so only thin-content fires.
const thinContent: Fixture = {
  path: "/content/thin-content",
  category: CAT,
  name: "Thin content",
  summary: "The page has almost no text on it.",
  lesson:
    "A page with very little text rarely ranks, and a lot of thin pages can pull down how a site is judged overall.",
  expectedIssues: ["thin-content"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: thinContent,
        title: "Thin content example",
        metaDescription:
          "A sparse page with almost no visible text, built to show how thin content reads to a crawler.",
        bodyHtml: `<h1>Nothing here yet</h1>
<p>This is the whole page. There is not enough here for a search engine to work with.</p>`,
      }),
    ),
};

// 10 — an <img> with no alt attribute -------------------------------------
const imagesMissingAlt: Fixture = {
  path: "/content/images-missing-alt",
  category: CAT,
  name: "Images missing alt text",
  summary: "One image on the page has no alt attribute.",
  lesson:
    'Alt text is how a screen reader describes an image and how a search engine reads it. Decorative images should use alt=""; the rest need a real description.',
  expectedIssues: ["images-missing-alt"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: imagesMissingAlt,
        title: "A page with an image that has no alt text",
        metaDescription:
          "This page has an image with no alt attribute, so a screen reader and a search engine cannot tell what it shows.",
        bodyHtml: `<h1>An image with no alt text</h1>
<p class="lede">The image below has no alt text, so a screen reader skips over it as if it were not there.</p>
<img src="/img/placeholder.svg" width="720" height="360">
<h2>Why alt text matters</h2>
<p>An image with no alt attribute is a blank spot for anyone using a screen reader and a mystery to a crawler trying to read the page. Alt text is the caption the software reads. An image that carries meaning needs a short, specific description of what it shows. An image that is only decoration should carry an empty alt so the software knows to skip it on purpose.</p>
<h2>Getting it right</h2>
<p>Describe what the image shows and does, not that it is an image. Keep it short and do not stuff it with keywords. Never leave the attribute off entirely. A missing alt and an empty alt look almost the same in the markup but mean the opposite thing to the software that reads them.</p>`,
      }),
    ),
};

// 11 — the same page served at two URLs (duplicate content + title + meta) --
const DUP_TITLE = "Pumpkin Spice Latte Recipe";
const DUP_META =
  "The same latte recipe, published word for word at two different URLs, so a search engine has to pick one and drop the other.";
const DUP_BODY = article({
  h1: "The same latte recipe, twice",
  lede: "This page is identical, byte for byte, to another URL on this site.",
  sections: [
    {
      h2: "Two URLs, one page",
      body: "Duplicate content is the same text living at more than one address: a trailing-slash variant, an http and an https copy, a print version, or, as here, the same article pasted at two paths. A search engine does not want to show the same thing twice, so it picks one URL to keep and drops the rest, and the ranking signals get split across copies that now compete with each other.",
    },
    {
      h2: "How to fix it",
      body: "Pick one URL to be the real one and point the duplicates at it with a rel=canonical tag, or send a 301 redirect so people and crawlers both land on the single page. On templated sites, watch for URL parameters and slashes creating identical pages you did not mean to make, each one taking a little strength from the page that should rank.",
    },
  ],
});
const duplicateContent: Fixture = {
  path: "/content/duplicate-a",
  extraPaths: ["/content/duplicate-b"],
  category: CAT,
  name: "Duplicate content (same page, two URLs)",
  summary: "Identical to /content/duplicate-b: same title, meta, and body.",
  lesson:
    "Identical pages at different URLs split the ranking signals. Pick one URL and redirect the rest.",
  expectedIssues: [
    "duplicate-content",
    "duplicate-title",
    "duplicate-meta-description",
  ],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: duplicateContent,
        title: DUP_TITLE,
        metaDescription: DUP_META,
        bodyHtml: DUP_BODY,
      }),
    ),
};

// 12 — two different pages that share only a <title> ----------------------
const SHARED_TITLE = "Blue Running Shoes | Sole Mates";
const dupTitleA: Fixture = {
  path: "/content/duplicate-title-a",
  category: CAT,
  name: "Duplicate title (product A)",
  summary: 'Shares the title "Blue Running Shoes | Sole Mates" with product B.',
  lesson:
    "Templated product pages often inherit one generic title. Put the thing that makes each page different (model, colour, size) in the title.",
  expectedIssues: ["duplicate-title"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: dupTitleA,
        title: SHARED_TITLE,
        metaDescription:
          "The Marathon model in cobalt blue, a cushioned daily trainer built for long, flat road miles.",
        bodyHtml: article({
          h1: "Marathon Trainer, Cobalt Blue",
          lede: "A cushioned road shoe for runners who put in serious weekly mileage.",
          sections: [
            {
              h2: "Built for distance",
              body: "The Marathon is a long-run shoe: a soft, high-stack midsole that stays comfortable deep into a twenty-miler, a breathable knit upper, and a durable outsole rated for hundreds of road miles. It is a different product from the Sprint, but both pages ship with the same title above, so a search engine cannot tell them apart at a glance.",
            },
            {
              h2: "Why the title matters here",
              body: "When every product in a catalogue inherits the same title, the pages compete for the same searches and none of them stands out. The fix is to put the differences, the model name and the colour and the use case, into the title template so Marathon and Sprint read as the separate products they are.",
            },
          ],
        }),
      }),
    ),
};
const dupTitleB: Fixture = {
  path: "/content/duplicate-title-b",
  category: CAT,
  name: "Duplicate title (product B)",
  summary: 'Shares the title "Blue Running Shoes | Sole Mates" with product A.',
  lesson:
    "The other half of the duplicate-title pair. A different product with a different write-up and the same title.",
  expectedIssues: ["duplicate-title"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: dupTitleB,
        title: SHARED_TITLE,
        metaDescription:
          "The Sprint model in electric blue, a firm, low-drop racing flat for 5K and 10K races.",
        bodyHtml: article({
          h1: "Sprint Racer, Electric Blue",
          lede: "A light racing flat for short, fast efforts on the track and road.",
          sections: [
            {
              h2: "Built for speed",
              body: "The Sprint is the opposite of a long-run shoe: a firm, responsive plate, a low drop that pushes a snappy forefoot strike, and almost no weight to carry around a fast 5K. No one would confuse it with the Marathon in person, but on a results page the two look the same because they carry the same title.",
            },
            {
              h2: "One title, two products",
              body: "This is the common store version of a duplicate title: a catalogue template that outputs a generic colour-and-category title for every item. A search engine groups the pages, the click rate drops, and the store competes with itself. Making the titles different is a small template change that helps across the whole catalogue.",
            },
          ],
        }),
      }),
    ),
};

// 13 — two different pages that share only a meta description -------------
const SHARED_META =
  "Fresh, seasonal, and made locally every morning, then delivered to your door. Order today.";
const dupMetaA: Fixture = {
  path: "/content/duplicate-meta-a",
  category: CAT,
  name: "Duplicate meta description (bakery)",
  summary: "Shares its meta description word for word with the florist page.",
  lesson:
    "One boilerplate description reused across pages produces the same snippet in search. Write one per page.",
  expectedIssues: ["duplicate-meta-description"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: dupMetaA,
        title: "Early Riser Bakery, sourdough and pastries",
        metaDescription: SHARED_META,
        bodyHtml: article({
          h1: "Early Riser Bakery",
          lede: "Slow-fermented sourdough and pastries, baked before dawn.",
          sections: [
            {
              h2: "What we bake",
              body: "Every loaf takes two days: a long, cold fermentation for flavour, a hot oven for the crust, and an open crumb inside. Alongside the bread we make croissants, morning buns, and a rotating set of seasonal tarts. This is clearly a bakery, but its meta description is the same generic sentence used on our florist site.",
            },
            {
              h2: "The snippet problem",
              body: "Because the description is shared, someone searching finds two of our pages with the same snippet and no way to tell the bakery from the flower shop. Reusing one sentence across every page feels efficient, but it gives up the chance to sell each page in the one place people actually read before clicking.",
            },
          ],
        }),
      }),
    ),
};
const dupMetaB: Fixture = {
  path: "/content/duplicate-meta-b",
  category: CAT,
  name: "Duplicate meta description (florist)",
  summary: "Shares its meta description word for word with the bakery page.",
  lesson:
    "The other half of the duplicate-meta pair. A different business, a different page, the same snippet.",
  expectedIssues: ["duplicate-meta-description"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: dupMetaB,
        title: "Petal & Stem, seasonal flower delivery",
        metaDescription: SHARED_META,
        bodyHtml: article({
          h1: "Petal & Stem Florist",
          lede: "Hand-tied seasonal bouquets, cut fresh and delivered the same day.",
          sections: [
            {
              h2: "What we arrange",
              body: "Our bouquets follow the seasons: tulips and ranunculus in spring, dahlias in late summer, amaryllis and evergreens through winter. Each is hand-tied to order and delivered in water so it lasts. This is very clearly a flower shop, not a bakery, but the two sites were built from one template and share the same meta description.",
            },
            {
              h2: "One sentence, two businesses",
              body: "When the same description is used on unrelated pages, the search results show the same snippet twice with nothing to tell them apart, and the click rate drops on both. The fix is to write a specific, honest description for each page that says what that page offers.",
            },
          ],
        }),
      }),
    ),
};

export const contentFixtures: Fixture[] = [
  thinContent,
  imagesMissingAlt,
  duplicateContent,
  dupTitleA,
  dupTitleB,
  dupMetaA,
  dupMetaB,
];
