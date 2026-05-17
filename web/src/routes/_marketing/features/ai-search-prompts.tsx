import { createFileRoute } from "@tanstack/react-router";
import { FeaturePageTemplate } from "@/components/feature-page";
import { featurePages } from "@/lib/feature-pages";
import { buildPageSeo } from "@/lib/seo";

const page = featurePages.aiSearchPrompts;

export const Route = createFileRoute("/_marketing/features/ai-search-prompts")({
  head: () =>
    buildPageSeo({
      title: "AI Search Prompt Explorer",
      description: page.description,
      path: "/features/ai-search-prompts",
      titleSuffix: "OpenSEO",
      imageAlt: page.imageAlt,
    }),
  component: () => <FeaturePageTemplate page={page} />,
});
