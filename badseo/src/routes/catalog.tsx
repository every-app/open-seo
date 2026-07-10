import { createFileRoute } from "@tanstack/react-router";
import { AUDIT_ISSUE_TYPES } from "../../../src/shared/audit-issues";
import { SiteLayout } from "../components/site-layout";
import {
  catalogLinkedFixtures,
  categories,
  duplicateUrlLinks,
} from "../fixtures/registry";
import type { Fixture } from "../fixtures/types";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Technical SEO issues checklist | badseo.dev" },
      {
        name: "description",
        content:
          "A checklist of common technical SEO issues, each with a live example page: head tags, duplicate content, redirects, HTTP status, speed, and site structure.",
      },
    ],
  }),
  component: CatalogPage,
});

function IssueDots({ fixture }: { fixture: Fixture }) {
  return fixture.expectedIssues.map((issueId) => {
    const issue = AUDIT_ISSUE_TYPES[issueId];
    return (
      <span
        className={`dot dot-${issue.severity}`}
        title={issue.title}
        key={issueId}
      />
    );
  });
}

function CatalogPage() {
  return (
    <SiteLayout>
      <main className="main">
        <h1>Technical SEO issues, by category</h1>
        <p className="lede">
          Every page on the site, grouped by the kind of technical SEO issue it
          shows. The dots are the issues an audit should report for that page.
        </p>
        <p className="legend">
          <span>
            <span className="dot dot-critical" /> critical
          </span>
          <span>
            <span className="dot dot-warning" /> warning
          </span>
          <span>
            <span className="dot dot-info" /> info
          </span>
        </p>

        {categories.map((category) => (
          <section className="index-group" key={category}>
            <h2>{category}</h2>
            <div className="index-list">
              {catalogLinkedFixtures
                .filter((fixture) => fixture.category === category)
                .map((fixture) => (
                  <a
                    className="index-row"
                    href={fixture.path}
                    key={fixture.path}
                  >
                    <span className="row-name">{fixture.name}</span>
                    <span className="row-sum">{fixture.summary}</span>
                    <span className="row-sev">
                      <IssueDots fixture={fixture} />
                    </span>
                  </a>
                ))}
            </div>
          </section>
        ))}

        <section className="index-group">
          <h2>Duplicate URLs</h2>
          <p>
            The same page served again at a second address. This is the raw
            material for the duplicate-content check. They are linked here so a
            crawler reaches them and does not mistake them for orphans.
          </p>
          <p>
            {duplicateUrlLinks.map((duplicate, index) => (
              <span key={duplicate.path}>
                {index > 0 ? " · " : null}
                <a href={duplicate.path}>
                  <code>{duplicate.path}</code>
                </a>
              </span>
            ))}
          </p>
        </section>
        <p style={{ marginTop: 32 }}>
          A few pages are left off this list on purpose. An orphan page (
          <code>/structure/orphan</code>) is only in the sitemap, and some 404,
          500, and 403 URLs are only in the sitemap too, so a crawler has to
          find them on its own.
        </p>
      </main>
    </SiteLayout>
  );
}
