import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const page = featurePages.keywordResearch;

export const Route = createFileRoute("/_marketing/features/keyword-research")({
  head: () =>
    buildPageSeo({
      title: "Keyword Research Tool",
      description: page.description,
      path: "/features/keyword-research",
      titleSuffix: brand.name,
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
