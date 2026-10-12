import { createFileRoute } from "@tanstack/react-router";
import { sitemapResponse } from "../server/badseo";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => sitemapResponse(request),
    },
  },
});
