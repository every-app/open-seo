import { createFileRoute, Link } from "@tanstack/react-router";
import { createClientLoader } from "fumadocs-mdx/runtime/vite";
import { DocsBody } from "fumadocs-ui/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { SiteFooter } from "@/components/site-footer";
import { BlogLayout } from "@/components/blog-layout";
import type { ComponentPropsWithoutRef } from "react";
import { Suspense } from "react";
import { getBlogPost } from "@/lib/content.functions";
import { blog } from "../../../source.generated";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/blogs/$")({
  loader: async ({ params }: { params: { _splat?: string } }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await getBlogPost({ data: slugs });
    await clientMdxLoader.preload(data.path);
    return data;
  },
  head: ({ loaderData }: { loaderData?: unknown }) => {
    const data = loaderData as
      | { title?: string; description?: string; url?: string }
      | undefined;
    const title = data?.title ?? "OpenSEO Blog";
    const description = data?.description;
    return buildPageSeo({
      title,
      description,
      path: data?.url ?? "/blogs",
      titleSuffix: "OpenSEO Blog",
      ogType: "article",
    });
  },
  component: BlogPost,
});

const clientMdxLoader = createClientLoader(blog, {
  id: "blog",
  component({ default: MDX }) {
    return (
      <DocsBody className="text-neutral-800 [&_a]:!text-neutral-950 [&_a]:underline [&_a]:decoration-[var(--color-brand-accent)] [&_a]:underline-offset-4 [&_h2]:text-neutral-950 [&_h2_a]:!no-underline [&_h3]:text-neutral-950 [&_h3_a]:!no-underline [&_li]:text-neutral-700 [&_p]:text-neutral-700 [&_strong]:text-neutral-950">
        <MDX
          components={{
            ...defaultMdxComponents,
            table: BlogTable,
            th: BlogTableHeader,
            td: BlogTableCell,
          }}
        />
      </DocsBody>
    );
  },
});

function BlogTable(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="not-prose my-8 w-full max-w-full overflow-x-auto rounded-xl border border-[var(--color-border-subtle)] bg-white">
      <table
        {...props}
        className="w-full min-w-[720px] border-collapse text-left text-sm"
      />
    </div>
  );
}

function BlogTableHeader(props: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      {...props}
      className="border-b border-r border-neutral-200 bg-neutral-950 px-4 py-3 text-left text-sm font-semibold text-white last:border-r-0"
    />
  );
}

function BlogTableCell(props: ComponentPropsWithoutRef<"td">) {
  return (
    <td
      {...props}
      className="border-b border-r border-neutral-200 px-4 py-3 align-top text-sm leading-6 text-neutral-700 last:border-r-0 [&_a]:font-medium [&_a]:!text-neutral-950"
    />
  );
}

function BlogPost() {
  const data = Route.useLoaderData() as {
    path: string;
    title: string;
    description?: string;
  };
  const Content = clientMdxLoader.getComponent(data.path);

  return (
    <BlogLayout>
      <article className="mx-auto max-w-3xl px-6 py-12 text-neutral-950 md:py-24">
        <BlogHeader title={data.title} description={data.description} />
        <Suspense>
          <Content />
        </Suspense>

        <div className="mt-16 border-t border-[var(--color-border-subtle)] pt-8">
          <SiteFooter className="text-xs text-neutral-600 [&_a]:transition-colors [&_a]:hover:text-neutral-900" />
        </div>
      </article>
    </BlogLayout>
  );
}

function BlogHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
      <div className="mb-4">
        <Link
          to="/blogs"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-brand-muted)] transition-colors hover:text-neutral-950"
        >
          <span aria-hidden="true">&larr;</span>
          <span>Back to Blog</span>
        </Link>
      </div>
      <h1 className="mb-5 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
        {title}
      </h1>
      {description && (
        <p className="max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
          {description}
        </p>
      )}
    </header>
  );
}
