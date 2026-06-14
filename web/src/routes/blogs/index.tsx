import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";
import { BlogLayout } from "@/components/blog-layout";
import { getBlogPosts } from "@/lib/content.functions";
import { buildPageSeo } from "@/lib/seo";

const blogIndexDescription = "SEO articles and guides from OpenSEO.";

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
    <BlogLayout>
      <div className="mx-auto max-w-5xl px-6 py-12 md:py-24">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Resources
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950 md:text-6xl">
          Blog
        </h1>

        {posts.length === 0 ? (
          <p className="mt-8 text-[var(--color-brand-muted)]">
            No posts yet. Check back soon.
          </p>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {posts.map((post) => (
              <article key={post.url}>
                <Link
                  to="/blogs/$"
                  params={{ _splat: post.slugs.join("/") }}
                  className="group block h-full rounded-lg border border-[var(--color-border-subtle)] bg-white p-6 transition-colors hover:border-neutral-900"
                >
                  <h2 className="text-2xl font-semibold tracking-tight text-neutral-950 transition-colors group-hover:text-[var(--color-brand-accent)]">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="mt-3 text-sm leading-6 text-[var(--color-brand-muted)]">
                      {post.description}
                    </p>
                  )}
                  <p className="mt-5 text-sm font-medium text-neutral-950">
                    Read post <span aria-hidden="true">&rarr;</span>
                  </p>
                </Link>
              </article>
            ))}
          </div>
        )}

        <div className="mt-16 border-t border-[var(--color-border-subtle)] pt-8">
          <SiteFooter className="text-xs text-neutral-600 [&_a]:transition-colors [&_a]:hover:text-neutral-900" />
        </div>
      </div>
    </BlogLayout>
  );
}
