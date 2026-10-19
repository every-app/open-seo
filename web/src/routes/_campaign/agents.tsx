import { createFileRoute } from "@tanstack/react-router";
import { AgentLandingPage } from "@/components/campaign-pages";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_campaign/agents")({
  head: () =>
    buildPageSeo({
      title: "Give your agent SEO superpowers - OpenSEO",
      description:
        "Connect OpenSEO to Claude, Codex, or any MCP client in 2 minutes for live keyword and competitor research. Open source, from $10/month.",
      path: "/agents",
    }),
  component: AgentLandingPage,
});
