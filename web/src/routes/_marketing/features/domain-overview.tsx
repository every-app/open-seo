import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const page = featurePages.domainOverview;

export const Route = createFileRoute("/_marketing/features/domain-overview")({
  head: () =>
    buildPageSeo({
      title: "Domain Analysis Tool",
      description: page.description,
      path: "/features/domain-overview",
      titleSuffix: "OpenSEO",
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
