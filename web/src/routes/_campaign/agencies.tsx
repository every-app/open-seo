import { createFileRoute } from "@tanstack/react-router";
import { AgencyLandingPage } from "@/components/campaign-pages";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_campaign/agencies")({
  head: () =>
    buildPageSeo({
      title: "Find your client's next SEO win - OpenSEO",
      description:
        "Enter a client's site and see the keywords they're closest to winning. Keyword research, rank tracking, and shareable reports for every client, from $10/month.",
      path: "/agencies",
    }),
  component: AgencyLandingPage,
});
