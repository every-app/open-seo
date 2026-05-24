import { createFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { ContentIndex } from "@/components/content-index";
import { baseOptions } from "@/lib/layout.shared";
import { getDocsPageTree, getDocsPosts } from "@/lib/content.functions";
import { buildPageSeo } from "@/lib/seo";

const docsDescription =
  "OpenSEO setup and reference docs for MCP, AI clients, and workflow configuration.";

export const Route = createFileRoute("/docs/")({
  head: () =>
    buildPageSeo({
      title: "OpenSEO Docs",
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
        title="OpenSEO Docs"
        description={docsDescription}
        emptyLabel="No docs yet. Check back soon."
        items={pages}
        route="/docs/$"
      />
    </DocsLayout>
  );
}
