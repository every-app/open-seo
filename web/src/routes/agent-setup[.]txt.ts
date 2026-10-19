import { createFileRoute } from "@tanstack/react-router";
import { getAgentSetupPrompt } from "../../../src/client/features/ai-mcp/agentSetupPrompt";

// The same setup prompt as the docs, landing page, and app, as plain text for
// agents linked from /llms.txt.
export const Route = createFileRoute("/agent-setup.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(getAgentSetupPrompt("https://app.openseo.so"), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
