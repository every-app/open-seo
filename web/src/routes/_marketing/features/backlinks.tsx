import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const page = featurePages.backlinks;

export const Route = createFileRoute("/_marketing/features/backlinks")({
  head: () =>
    buildPageSeo({
      title: "Backlink Analysis Tool",
      description: page.description,
      path: "/features/backlinks",
      titleSuffix: "OpenSEO",
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
