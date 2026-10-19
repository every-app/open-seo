import { createFileRoute } from "@tanstack/react-router";

// Some agents look for llms.txt under the docs path; the site has one file.
export const Route = createFileRoute("/docs/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 301,
          headers: { Location: "/llms.txt" },
        }),
    },
  },
});
