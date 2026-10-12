import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";
import { autumn } from "@/server/billing/autumn";

// The backend of the autumn-js browser client, which the app no longer uses:
// billing reads, checkout and the portal go through server functions. Tabs
// opened before that change still read their customer here; every other
// route asks them to reload. Delete this once those tabs are gone.
async function handleAutumnRequest(request: Request) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
  }

  if (
    new URL(request.url).pathname.split("/").pop() !== "getOrCreateCustomer"
  ) {
    return Response.json(
      {
        message: "Billing has changed. Reload the page and try again.",
        code: "reload_required",
      },
      { status: 410 },
    );
  }

  let context;
  try {
    context = await resolveHostedContext(request.headers);
  } catch {
    return Response.json(
      { message: "Authentication required.", code: "unauthenticated" },
      { status: 401 },
    );
  }

  // Nothing from the request body is passed on. The expand covers what those
  // tabs use: features for the client's local checks and plan names.
  return Response.json(
    await autumn.customers.getOrCreate({
      customerId: context.organizationId,
      email: context.userEmail,
      expand: ["balances.feature", "subscriptions.plan"],
    }),
  );
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
