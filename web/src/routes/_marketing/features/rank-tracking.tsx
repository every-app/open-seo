import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const page = featurePages.rankTracking;

export const Route = createFileRoute("/_marketing/features/rank-tracking")({
  head: () =>
    buildPageSeo({
      title: "Rank Tracker",
      description: page.description,
      path: "/features/rank-tracking",
      titleSuffix: "OpenSEO",
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
