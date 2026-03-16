import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { getBlogPosts } from "@/lib/content.functions";
import { buildPageSeo } from "@/lib/seo";

const blogIndexDescription = "Updates and guides from OpenSEO.";

export const Route = createFileRoute("/blogs/")({
  head: () =>
    buildPageSeo({
      title: "OpenSEO Blog",
      description: blogIndexDescription,
      path: "/blogs",
    }),
  component: BlogIndex,
  loader: async () => await getBlogPosts(),
});

function BlogIndex() {
  const posts = Route.useLoaderData();

  return (
    <HomeLayout {...baseOptions()}>
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-24">
        <h1 className="text-4xl font-bold mb-8">Blog</h1>

        {posts.length === 0 ? (
          <p className="text-fd-muted-foreground">
            No blog posts yet. Check back soon.
          </p>
        ) : (
          <div className="space-y-8">
            {posts.map((post) => (
              <article key={post.url} className="border-b pb-8 last:border-b-0">
                <Link
                  to="/blogs/$"
                  params={{ _splat: post.slugs.join("/") }}
                  className="group"
                >
                  <h2 className="text-2xl font-semibold group-hover:text-fd-primary transition-colors mb-2">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="text-fd-muted-foreground">
                      {post.description}
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
