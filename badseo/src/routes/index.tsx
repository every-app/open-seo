import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "../components/site-layout";
import { allFixtures, fixturePaths } from "../fixtures/registry";

const totalPaths = allFixtures.reduce(
  (count, fixture) => count + fixturePaths(fixture).length,
  0,
);
const distinctIssueTypes = new Set(
  allFixtures.flatMap((fixture) => fixture.expectedIssues),
).size;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Technical SEO issues, by example | badseo.dev" },
      {
        name: "description",
        content:
          "Every page here has one common technical SEO issue, from a missing title to a redirect loop, so you can test what your SEO crawler catches.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <SiteLayout>
      <main className="main">
        <section className="hero">
          <h1>A website demonstrating common technical SEO problems</h1>
          <p className="lede">
            Every page on this site has one thing wrong with it, on purpose: a
            missing title, a redirect loop, a page nothing links to. Point an
            SEO crawler at the site and see which problems it catches.
          </p>
        </section>

        <div className="stat-row">
          <div className="stat">
            <b>{allFixtures.length}</b>
            <span>broken pages</span>
          </div>
          <div className="stat">
            <b>{distinctIssueTypes}</b>
            <span>issue types</span>
          </div>
          <div className="stat">
            <b>{totalPaths}</b>
            <span>crawlable URLs</span>
          </div>
        </div>

        <h2>What&apos;s on it</h2>
        <p>
          Each page breaks one thing and is otherwise fine, so an audit sees a
          single problem instead of a pile of them. Every page shows what it is
          testing and which issue an audit should report. Start with the{" "}
          <a href="/catalog">catalog</a>, or open the{" "}
          <a href="/kitchen-sink">kitchen-sink page</a>, which breaks six ways
          at once.
        </p>

        <h2>Why it exists</h2>
        <p>
          SEO tools all say they find broken titles, duplicate pages, redirect
          chains, and thin content. It is hard to check that they actually do.
          badseo.dev gives you a site that is broken in known ways, so you can
          run a crawler against it and compare what it finds to what is really
          there. We use it to test the OpenSEO audit.
        </p>

        <h2>It&apos;s open source</h2>
        <p>
          The site is open source. If there is a common SEO mistake it does not
          cover yet, you can add it. Each page is one small file that lists the
          issues it should trigger, so a new page also works as a test. It is
          maintained by the team behind <a href="https://openseo.so">OpenSEO</a>
          , an open-source SEO tool.
        </p>

        <h2>Run an audit</h2>
        <p>
          <a href="https://openseo.so">OpenSEO</a> can crawl badseo.dev and
          report the issues on each page, along with how to fix them. It is a
          straightforward way to see what a crawler catches.
        </p>
      </main>
    </SiteLayout>
  );
}
