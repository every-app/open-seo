// The two non-fixture pages: the homepage and the catalog. Both must audit
// CLEAN — they're the crawl entry point and the hub that links every fixture,
// so any accidental issue here would show up in the e2e run.
import { renderShell, escapeHtml } from "./lib";
import { AUDIT_ISSUE_TYPES } from "../../src/shared/audit-issues";
import {
  allFixtures,
  catalogLinkedFixtures,
  categories,
  duplicateUrlLinks,
  fixturePaths,
} from "./fixtures/registry";
import type { Fixture } from "./fixtures/types";

const totalPaths = allFixtures.reduce((n, f) => n + fixturePaths(f).length, 0);
const distinctIssueTypes = new Set(allFixtures.flatMap((f) => f.expectedIssues))
  .size;

export function renderHome(): string {
  return renderShell({
    title: "Technical SEO issues, by example | badseo.dev",
    metaDescription:
      "Every page here has one common technical SEO issue, from a missing title to a redirect loop, so you can test what your SEO crawler catches.",
    bodyHtml: `<section class="hero">
  <h1>A website demonstrating common technical SEO problems</h1>
  <p class="lede">Every page on this site has one thing wrong with it, on purpose: a missing title, a redirect loop, a page nothing links to. Point an SEO crawler at the site and see which problems it catches.</p>
</section>

<div class="stat-row">
  <div class="stat"><b>${allFixtures.length}</b><span>broken pages</span></div>
  <div class="stat"><b>${distinctIssueTypes}</b><span>issue types</span></div>
  <div class="stat"><b>${totalPaths}</b><span>crawlable URLs</span></div>
</div>

<h2>What's on it</h2>
<p>Each page breaks one thing and is otherwise fine, so an audit sees a single problem instead of a pile of them. Every page shows what it is testing and which issue an audit should report. Start with the <a href="/catalog">catalog</a>, or open the <a href="/kitchen-sink">kitchen-sink page</a>, which breaks six ways at once.</p>

<h2>Why it exists</h2>
<p>SEO tools all say they find broken titles, duplicate pages, redirect chains, and thin content. It is hard to check that they actually do. badseo.dev gives you a site that is broken in known ways, so you can run a crawler against it and compare what it finds to what is really there. We use it to test the OpenSEO audit.</p>

<h2>It's open source</h2>
<p>The site is open source. If there is a common SEO mistake it does not cover yet, you can add it. Each page is one small file that lists the issues it should trigger, so a new page also works as a test. It is maintained by the team behind <a href="https://openseo.so">OpenSEO</a>, an open-source SEO tool.</p>

<h2>Run an audit</h2>
<p><a href="https://openseo.so">OpenSEO</a> can crawl badseo.dev and report the issues on each page, along with how to fix them. It is a straightforward way to see what a crawler catches.</p>`,
  });
}

function issueDots(fixture: Fixture): string {
  return fixture.expectedIssues
    .map((id) => {
      const sev = AUDIT_ISSUE_TYPES[id].severity;
      return `<span class="dot dot-${sev}" title="${escapeHtml(
        AUDIT_ISSUE_TYPES[id].title,
      )}"></span>`;
    })
    .join("");
}

function indexRow(fixture: Fixture): string {
  return `<a class="index-row" href="${escapeHtml(fixture.path)}">
  <span class="row-name">${escapeHtml(fixture.name)}</span>
  <span class="row-sum">${escapeHtml(fixture.summary)}</span>
  <span class="row-sev">${issueDots(fixture)}</span>
</a>`;
}

export function renderCatalog(): string {
  const groups = categories
    .map((category) => {
      const rows = catalogLinkedFixtures
        .filter((f) => f.category === category)
        .map(indexRow)
        .join("\n");
      return `<section class="index-group">
  <h2>${escapeHtml(category)}</h2>
  <div class="index-list">
${rows}
  </div>
</section>`;
    })
    .join("\n");

  return renderShell({
    title: "Technical SEO issues checklist | badseo.dev",
    metaDescription:
      "A checklist of common technical SEO issues, each with a live example page: head tags, duplicate content, redirects, HTTP status, speed, and site structure.",
    bodyHtml: `<h1>Technical SEO issues, by category</h1>
<p class="lede">Every page on the site, grouped by the kind of technical SEO issue it shows. The dots are the issues an audit should report for that page.</p>
<p class="legend">
  <span><span class="dot dot-critical"></span> critical</span>
  <span><span class="dot dot-warning"></span> warning</span>
  <span><span class="dot dot-info"></span> info</span>
</p>
${groups}
<section class="index-group">
  <h2>Duplicate URLs</h2>
  <p>The same page served again at a second address. This is the raw material for the duplicate-content check. They are linked here so a crawler reaches them and does not mistake them for orphans.</p>
  <p>${duplicateUrlLinks
    .map(
      (d) =>
        `<a href="${escapeHtml(d.path)}"><code>${escapeHtml(
          d.path,
        )}</code></a>`,
    )
    .join(" &middot; ")}</p>
</section>
<p style="margin-top:32px">A few pages are left off this list on purpose. An orphan page (<code>/structure/orphan</code>) is only in the sitemap, and some 404, 500, and 403 URLs are only in the sitemap too, so a crawler has to find them on its own.</p>`,
  });
}
