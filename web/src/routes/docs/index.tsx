import { createFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { ContentIndex } from "@/components/content-index";
import { brand } from "@/lib/brand";
import { baseOptions } from "@/lib/layout.shared";
import { getDocsPageTree, getDocsPosts } from "@/lib/content.functions";
import { buildPageSeo } from "@/lib/seo";

const docsDescription =
  `${brand.name} setup and reference docs for MCP, AI clients, and workflow configuration.`;

export const Route = createFileRoute("/docs/")({
  head: () =>
    buildPageSeo({
      title: `${brand.name} Docs`,
      description: docsDescription,
      path: "/docs",
    }),
  component: DocsIndex,
  loader: async () => ({
    pages: await getDocsPosts(),
    pageTree: await getDocsPageTree(),
  }),
});

function DocsIndex() {
  const { pages, pageTree } = Route.useLoaderData();

  return (
    <DocsLayout tree={pageTree} {...baseOptions()}>
      <ContentIndex
        eyebrow="Docs"
        title={`${brand.name} Docs`}
        description={docsDescription}
        emptyLabel="No docs yet. Check back soon."
        items={pages}
        route="/docs/$"
      />
    </DocsLayout>
  );
}
