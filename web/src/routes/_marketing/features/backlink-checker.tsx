import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const page = featurePages.backlinkChecker;

export const Route = createFileRoute("/_marketing/features/backlink-checker")({
  head: () =>
    buildPageSeo({
      title: "Backlink Checker",
      description: page.description,
      path: "/features/backlink-checker",
      titleSuffix: "OpenSEO",
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
