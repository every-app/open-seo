import { createFileRoute } from "@tanstack/react-router";
import { handleFixtureRequest } from "../server/badseo";

export const Route = createFileRoute("/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleFixtureRequest(request),
    },
  },
});
