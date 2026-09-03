import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";
import { article } from "./helpers";

const CAT = "Structured data";

function ldJson(payload: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
}

// 33 — several JSON-LD entities that never reference each other ------------
const unlinkedGraph: Fixture = {
  path: "/structured-data/unlinked-graph",
  category: CAT,
  name: "Structured data is not a linked graph",
  summary:
    "Three separate JSON-LD blocks. Each is valid. None of them reference each other.",
  lesson:
    "Structured data is read as one graph of entities. Emitting an Article, an Organization and a Person as three islands says nothing about how they relate, so no consumer can tell who wrote the article or who published it. Wrap them in a single @graph, or give each one an @id and point at it from the others.",
  expectedIssues: ["jsonld-not-linked-graph"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: unlinkedGraph,
        title: "Three islands of structured data",
        metaDescription:
          "This page emits an Article, an Organization and a Person as three unconnected JSON-LD blocks, so nothing ties the entities together.",
        headExtra: [
          ldJson({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Three islands of structured data",
          }),
          ldJson({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Bad SEO Industries",
          }),
          ldJson({
            "@context": "https://schema.org",
            "@type": "Person",
            name: "Dana Marks",
          }),
        ].join(""),
        bodyHtml: article({
          h1: "Three islands of structured data",
          lede: "The markup on this page is valid. It is also disconnected, which throws away most of its value.",
          sections: [
            {
              h2: "Why linking the entities matters",
              body: "Search engines and AI assistants do not read your structured data block by block. They merge it into a single graph of entities and then ask questions of that graph: who wrote this, who published it, what does this organisation do. When each block stands alone, none of those questions have answers. You have described three things and stated no relationship between them, so the markup adds far less than it looks like it does.",
            },
            {
              h2: "Two ways to connect them",
              body: "The simplest fix is a single script holding a @graph array with every entity inside it. The other way, useful when blocks are emitted by different templates or components, is to give each entity a stable @id such as https://example.com/#organisation and then reference that id from the other entities. Either way a consumer can walk from the article to its author and its publisher instead of guessing.",
            },
          ],
        }),
      }),
    ),
};

// 34 — the same entities, correctly linked (regression guard) --------------
const linkedGraph: Fixture = {
  path: "/structured-data/linked-graph",
  category: CAT,
  name: "Structured data as a linked graph",
  summary:
    "The same three entities, connected through @id references across blocks.",
  lesson:
    "This page is the counter-example: separate blocks are fine as long as the entities reference each other by @id. It exists so the linked-graph check cannot start firing on correct markup.",
  expectedIssues: [],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: linkedGraph,
        title: "Structured data done as one graph",
        metaDescription:
          "The same Article, Organization and Person, this time connected by @id references so consumers can walk from the article to its author and publisher.",
        headExtra: [
          ldJson({
            "@context": "https://schema.org",
            "@type": "Article",
            "@id": "https://badseo.dev/structured-data/linked-graph#article",
            headline: "Structured data done as one graph",
            author: { "@id": "https://badseo.dev/#person" },
            publisher: { "@id": "https://badseo.dev/#organization" },
          }),
          ldJson({
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": "https://badseo.dev/#organization",
            name: "Bad SEO Industries",
          }),
          ldJson({
            "@context": "https://schema.org",
            "@type": "Person",
            "@id": "https://badseo.dev/#person",
            name: "Dana Marks",
          }),
        ].join(""),
        bodyHtml: article({
          h1: "Structured data done as one graph",
          lede: "Same three entities as the previous page, this time joined up.",
          sections: [
            {
              h2: "What changed",
              body: "Every entity now carries an @id, and the article points at the other two through those ids. The blocks are still separate scripts, which is realistic: a header component emits the organisation, an author component emits the person, the page template emits the article. Because they agree on identifiers, a consumer merges them into one graph anyway and can answer who wrote and who published the piece.",
            },
            {
              h2: "Choosing identifiers",
              body: "Use absolute URLs with a fragment, and keep them stable over time. A good identifier names the thing rather than the page it happened to appear on, which is why the organisation here is site-wide rather than scoped to this URL. Reusing the same id everywhere the entity appears is what lets a crawler recognise it as one organisation across your whole site instead of a new one per page.",
            },
          ],
        }),
      }),
    ),
};

export const structuredDataFixtures: Fixture[] = [unlinkedGraph, linkedGraph];
