import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";
import { article } from "./helpers";

const CAT = "Indexability & canonical";

// 14 — noindex via robots meta tag ----------------------------------------
const noindexMeta: Fixture = {
  path: "/index/noindex-meta",
  category: CAT,
  name: "Noindex (robots meta)",
  summary: 'Has <meta name="robots" content="noindex"> in the head.',
  lesson:
    "Noindex is often on purpose, like on a thank-you or filter page. An audit flags it so you can catch pages that were hidden from search by mistake.",
  expectedIssues: ["noindex-page"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: noindexMeta,
        title: "A page set to noindex",
        metaDescription:
          "This page can be crawled, but a robots noindex tag tells search engines to keep it out of results.",
        robotsMeta: "noindex, follow",
        bodyHtml: article({
          h1: "This page asks not to be indexed",
          lede: "Nothing is wrong with this page. It just does not want to be in Google.",
          sections: [
            {
              h2: "When noindex is right",
              body: "Some pages should not show up in search: internal search results, filter combinations, thank-you pages, staging content. A robots noindex tag is the correct way to keep them out while still letting crawlers follow their links. It is a feature, most of the time.",
            },
            {
              h2: "When it is a problem",
              body: "The same tag becomes a problem when it ends up on pages that were meant to rank. A noindex left over from a staging setup, or a template that applies it too widely, can drop a whole section of a site from search. That is why an audit reports every noindex it finds, so a person can confirm each one is on purpose.",
            },
          ],
        }),
      }),
    ),
};

// 15 — noindex via X-Robots-Tag response header ---------------------------
const noindexHeader: Fixture = {
  path: "/index/noindex-header",
  category: CAT,
  name: "Noindex (X-Robots-Tag header)",
  summary: "No robots meta tag. The noindex comes in an HTTP header instead.",
  lesson:
    "X-Robots-Tag lives in the response headers, not the HTML. A crawler has to read headers, not just the page, to catch it.",
  expectedIssues: ["noindex-page"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: noindexHeader,
        title: "Noindex set in a response header",
        metaDescription:
          "The HTML on this page looks indexable, but an X-Robots-Tag header tells search engines to skip it.",
        bodyHtml: article({
          h1: "A noindex you cannot see in the HTML",
          lede: "View the source all you want. This page's noindex is in the HTTP headers.",
          sections: [
            {
              h2: "Headers can control indexing too",
              body: "The X-Robots-Tag response header does what a robots meta tag does, but from the HTTP layer instead of the page. It is handy for files like PDFs and for setting rules at the server or CDN level. The catch is that it is invisible if you only look at the rendered HTML, which is how it can hide for months.",
            },
            {
              h2: "Why a tool has to check both",
              body: "A crawler that reads only the HTML will report this page as indexable, because nothing in the markup says otherwise. Catching a header-level rule means reading the response headers on every request. This page exists to check that an audit does that, instead of trusting the HTML.",
            },
          ],
        }),
      }),
      { headers: { "x-robots-tag": "noindex" } },
    ),
};

// 16 — canonical points to a different URL --------------------------------
const canonicalized: Fixture = {
  path: "/index/canonicalized",
  category: CAT,
  name: "Canonicalized to another URL",
  summary: "Names the homepage as its canonical, so it defers indexing to it.",
  lesson:
    "A canonical that points at another URL tells search engines to index that page instead. Fine on purpose, and a quiet way to lose rankings by mistake.",
  expectedIssues: ["canonicalized-page"],
  handler: (ctx) =>
    htmlResponse(
      renderPage({
        fixture: canonicalized,
        title: "A page whose canonical points elsewhere",
        metaDescription:
          "This page's rel=canonical points at the homepage, telling search engines to credit that URL instead of this one.",
        canonical: `${ctx.origin}/`,
        bodyHtml: article({
          h1: "This is not the canonical page",
          lede: "This page exists, but it tells search engines to index a different URL in its place.",
          sections: [
            {
              h2: "What a cross-URL canonical does",
              body: "A rel=canonical pointing at a different address is an instruction: treat that other URL as the real one and fold the ranking signals into it. It is the right tool for syndicated copies, parameter variants, and print versions. Used on purpose, it prevents duplicate-content problems before they start.",
            },
            {
              h2: "When it goes wrong",
              body: "It becomes a real problem when a template hardcodes the homepage, or a staging domain, as the canonical for every page. Now the whole site tells search engines that none of its pages should rank on their own, and they should all defer to one URL. The pages drop out of results with no error anywhere, which is why an audit reports every canonical that points away from its own page.",
            },
          ],
        }),
      }),
    ),
};

// 17 — HTML canonical conflicts with Link-header canonical ----------------
const canonicalConflict: Fixture = {
  path: "/index/canonical-conflict",
  category: CAT,
  name: "Conflicting canonical signals",
  summary: "The HTML canonical and the HTTP Link-header canonical disagree.",
  lesson:
    "When two canonical tags point at different URLs, search engines trust neither and pick their own. Declare the canonical in one place.",
  expectedIssues: ["canonical-conflict", "canonicalized-page"],
  handler: (ctx) =>
    htmlResponse(
      renderPage({
        fixture: canonicalConflict,
        title: "A page with two different canonicals",
        metaDescription:
          "This page ships two canonical URLs that disagree: one in the HTML head and a different one in the HTTP Link header.",
        canonical: `${ctx.origin}/index/canonical-conflict?via=html`,
        bodyHtml: article({
          h1: "Two canonicals that disagree",
          lede: "The head names one canonical URL. The HTTP header names another. Both lose.",
          sections: [
            {
              h2: "Mixed signals",
              body: "You can set a canonical URL in the HTML head with a link tag, or in the HTTP response with a Link header. Search engines read both. When the two disagree, as they do here, the search engine cannot trust either one, so it drops them and picks a canonical on its own, which is rarely the one you wanted.",
            },
            {
              h2: "Pick one place",
              body: "Set the canonical in one place and keep it consistent. Most sites use the HTML head tag and never touch the header. If a CDN or framework is adding a Link-header canonical you did not ask for, that is usually the cause. Line it up with the head tag, or remove it, so there is one clear answer.",
            },
          ],
        }),
      }),
      {
        headers: {
          link: `<${ctx.origin}/index/canonical-conflict?via=header>; rel="canonical"`,
        },
      },
    ),
};

export const indexabilityFixtures: Fixture[] = [
  noindexMeta,
  noindexHeader,
  canonicalized,
  canonicalConflict,
];
