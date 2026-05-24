import { createFileRoute } from "@tanstack/react-router";
import { createClientLoader } from "fumadocs-mdx/runtime/vite";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { ContentPost, mdxComponents } from "@/components/content-post";
import { baseOptions } from "@/lib/layout.shared";
import { getDocsPageTree, getDocsPost } from "@/lib/content.functions";
import { buildPageSeo } from "@/lib/seo";
import { docs } from "../../../source.generated";

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }: { params: { _splat?: string } }) => {
    const slugs = params._splat?.split("/") ?? [];
    const page = await getDocsPost({ data: slugs });
    await clientMdxLoader.preload(page.path);
    return {
      ...page,
      pageTree: await getDocsPageTree(),
    };
  },
  head: ({ loaderData }: { loaderData?: unknown }) => {
    const data = loaderData as
      | { title?: string; description?: string; url?: string }
      | undefined;
    return buildPageSeo({
      title: data?.title ?? "OpenSEO Docs",
      description: data?.description,
      path: data?.url ?? "/docs",
      titleSuffix: "OpenSEO",
    });
  },
  component: DocsPost,
});

const clientMdxLoader = createClientLoader(docs, {
  id: "docs",
  component({ default: MDX }) {
    return <MDX components={mdxComponents} />;
  },
});

function DocsPost() {
  const data = Route.useLoaderData();
  const Content = clientMdxLoader.getComponent(data.path);

  return (
    <DocsLayout tree={data.pageTree} {...baseOptions()}>
      <ContentPost
        backLabel="Back to Docs"
        backTo="/docs"
        title={data.title}
        description={data.description}
        Content={Content}
      />
    </DocsLayout>
  );
}
