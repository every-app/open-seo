import { createFileRoute } from "@tanstack/react-router";
import { webBotAuthDirectoryResponse } from "@/server/lib/audit/web-bot-auth";

// Web Bot Auth key directory: the public key that verifies the site audit
// crawler's request signatures.
export const Route = createFileRoute(
  "/.well-known/http-message-signatures-directory",
)({
  server: {
    handlers: {
      GET: async ({ request }) => webBotAuthDirectoryResponse(request),
    },
  },
});
