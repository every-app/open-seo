import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";
import { brand } from "@/lib/brand";

const page = featurePages.aiBrandVisibility;

export const Route = createFileRoute(
  "/_marketing/features/ai-brand-visibility",
)({
  head: () =>
    buildPageSeo({
      title: "AI Brand Visibility Tool",
      description: page.description,
      path: "/features/ai-brand-visibility",
      titleSuffix: brand.name,
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
