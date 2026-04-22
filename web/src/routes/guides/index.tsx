import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { getGuidePosts } from "@/lib/content.functions";
import { buildPageSeo } from "@/lib/seo";

const guideIndexDescription = "Founder-focused guides from OpenSEO.";

export const Route = createFileRoute("/guides/")({
  head: () =>
    buildPageSeo({
      title: "OpenSEO Guides",
      description: guideIndexDescription,
      path: "/guides",
    }),
  component: GuideIndex,
  loader: async () => await getGuidePosts(),
});

function GuideIndex() {
  const guides = Route.useLoaderData();

  return (
    <HomeLayout {...baseOptions()}>
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-24">
        <h1 className="text-4xl font-bold mb-8">Guides</h1>

        {guides.length === 0 ? (
          <p className="text-fd-muted-foreground">
            No guides yet. Check back soon.
          </p>
        ) : (
          <div className="space-y-8">
            {guides.map((guide) => (
              <article key={guide.url} className="border-b pb-8 last:border-b-0">
                <Link
                  to="/guides/$"
                  params={{ _splat: guide.slugs.join("/") }}
                  className="group"
                >
                  <h2 className="text-2xl font-semibold group-hover:text-fd-primary transition-colors mb-2">
                    {guide.title}
                  </h2>
                  {guide.description && (
                    <p className="text-fd-muted-foreground">
                      {guide.description}
                    </p>
                  )}
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </HomeLayout>
  );
}
