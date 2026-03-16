import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { createClientLoader } from "fumadocs-mdx/runtime/vite";
import { DocsBody } from "fumadocs-ui/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { baseOptions } from "@/lib/layout.shared";
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
      <DocsBody>
        <MDX
          components={{
            ...defaultMdxComponents,
          }}
        />
      </DocsBody>
    );
  },
});

function BlogPost() {
  const data = Route.useLoaderData() as {
    path: string;
    title: string;
    description?: string;
  };
  const Content = clientMdxLoader.getComponent(data.path);

  return (
    <HomeLayout {...baseOptions()}>
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-24">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">{data.title}</h1>
          {data.description && (
            <p className="text-lg text-fd-muted-foreground">
              {data.description}
            </p>
          )}
        </header>
        <Suspense>
          <Content />
        </Suspense>
      </article>
    </HomeLayout>
  );
}
