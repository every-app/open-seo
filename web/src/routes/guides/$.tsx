import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { createClientLoader } from "fumadocs-mdx/runtime/vite";
import { DocsBody } from "fumadocs-ui/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { baseOptions } from "@/lib/layout.shared";
import { Suspense } from "react";
import { getGuidePost } from "@/lib/content.functions";
import { guide } from "../../../source.generated";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/guides/$")({
  loader: async ({ params }: { params: { _splat?: string } }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await getGuidePost({ data: slugs });
    await clientMdxLoader.preload(data.path);
    return data;
  },
  head: ({ loaderData }: { loaderData?: unknown }) => {
    const data = loaderData as
      | { title?: string; description?: string; url?: string }
      | undefined;
    const title = data?.title ?? "OpenSEO Guides";
    const description = data?.description;
    return buildPageSeo({
      title,
      description,
      path: data?.url ?? "/guides",
      titleSuffix: "OpenSEO Guides",
      ogType: "article",
    });
  },
  component: GuidePost,
});

const clientMdxLoader = createClientLoader(guide, {
  id: "guide",
  component({ default: MDX }) {
    return (
      <DocsBody className="text-fd-foreground [&_h2]:text-fd-foreground [&_h3]:text-fd-foreground [&_li]:text-fd-foreground/90 [&_p]:text-fd-foreground/90 [&_strong]:text-fd-foreground">
        <MDX
          components={{
            ...defaultMdxComponents,
          }}
        />
      </DocsBody>
    );
  },
});

function GuidePost() {
  const data = Route.useLoaderData() as {
    path: string;
    title: string;
    description?: string;
  };
  const Content = clientMdxLoader.getComponent(data.path);

  return (
    <HomeLayout {...baseOptions()}>
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-24 text-fd-foreground">
        <GuideHeader title={data.title} description={data.description} />
        <Suspense>
          <Content />
        </Suspense>
      </article>
    </HomeLayout>
  );
}

function GuideHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8">
      <div className="mb-4">
        <Link
          to="/guides"
          className="inline-flex items-center gap-2 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-primary"
        >
          <span aria-hidden="true">&larr;</span>
          <span>Back to Guides</span>
        </Link>
      </div>
      <h1 className="mb-4 text-4xl font-bold text-fd-foreground md:text-5xl">
        {title}
      </h1>
      {description && (
        <p className="max-w-2xl text-lg leading-8 text-fd-muted-foreground md:text-xl">
          {description}
        </p>
      )}
    </header>
  );
}
