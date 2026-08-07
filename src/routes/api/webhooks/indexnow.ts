import { createFileRoute } from "@tanstack/react-router";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { handleIndexNowWebhookRequest } from "@/server/features/indexnow/webhook";

async function handleWebhookRequest(request: Request): Promise<Response> {
  const [secret, allowedHosts] = await Promise.all([
    getOptionalEnvValue("INDEXNOW_WEBHOOK_SECRET"),
    getOptionalEnvValue("INDEXNOW_WEBHOOK_HOSTS"),
  ]);

  return handleIndexNowWebhookRequest(request, {
    secret,
    allowedHosts,
  });
}

export const Route = createFileRoute("/api/webhooks/indexnow")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) =>
        handleWebhookRequest(request),
    },
  },
});
