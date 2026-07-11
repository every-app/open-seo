import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "../components/site-layout";
import { catalogLinkedFixtures, categories } from "../fixtures/registry";

const PRODUCT_DESCRIPTION =
  "A website with example technical SEO issues for you to learn or test your agents";

const homepageCategories = [
  "Kitchen sink",
  ...categories.filter(
    (category) =>
      category !== "Kitchen sink" &&
      category !== "Head tags & headings" &&
      category !== "Content quality",
  ),
  "Head tags & headings",
  "Content quality",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BadSEO | Technical SEO test site" },
      { name: "description", content: PRODUCT_DESCRIPTION },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <SiteLayout>
      <main className="home-main">
        <section className="home-hero">
          <div className="home-copy">
            <h1>BadSEO</h1>
            <p>{PRODUCT_DESCRIPTION}</p>
          </div>
        </section>

        <div className="home-issues" id="issues">
          {homepageCategories.map((category) => (
            <section className="home-issue-group" key={category}>
              <h3>{category}</h3>
              <div className="home-case-head" aria-hidden="true">
                <span>Issue</span>
                <span>What it demonstrates</span>
              </div>
              <div className="home-case-list">
                {catalogLinkedFixtures
                  .filter((fixture) => fixture.category === category)
                  .map((fixture) => (
                    <a
                      className="home-case-row"
                      href={fixture.path}
                      key={fixture.path}
                    >
                      <span className="home-case-name">{fixture.name}</span>
                      <span className="home-case-summary">
                        {fixture.summary}
                      </span>
                    </a>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </SiteLayout>
  );
}
