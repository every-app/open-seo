import { createFileRoute } from "@tanstack/react-router";
import { autumnHandler } from "autumn-js/fetch";
import { env } from "cloudflare:workers";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";

const handler = autumnHandler({
  identify: async (request) => {
    const context = await resolveHostedContext(request.headers);

    return {
      customerId: context.organizationId,
    };
  },
});

function handleAutumnRequest(request: Request) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
  }

  return handler(request);
}

export const Route = createFileRoute("/api/autumn/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleAutumnRequest(request);
      },
      POST: async ({ request }: { request: Request }) => {
        return handleAutumnRequest(request);
      },
    },
  },
});
