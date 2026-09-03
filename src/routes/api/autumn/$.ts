import { createFileRoute } from "@tanstack/react-router";
import type { autumnHandler } from "autumn-js/fetch";
import { env } from "cloudflare:workers";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { hasOrgPermission } from "@/lib/org-permissions";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";

// Autumn routes any org member may call: balance/customer reads that power
// credit meters and usage views. Every other route (attach, updateSubscription,
// openCustomerPortal, setupPayment, referrals, previews, ...) changes the
// org's subscription or payment state and is owner-only — unknown/new routes
// fail closed into the owner-only branch.
const MEMBER_READABLE_AUTUMN_ROUTES = new Set([
  "getOrCreateCustomer",
  "getEntity",
  "listPlans",
  "listEvents",
  "aggregateEvents",
]);

// The caller's context is resolved exactly once per request, in
// handleAutumnRequest, and shared with Autumn's identify callback through this
// map. Resolving twice (identify re-reads the same headers) would let an
// active-org switch or membership change between the two reads authorize
// against one organization but bill another.
const contextByRequest = new WeakMap<Request, EnsuredUserContext>();

let handlerPromise: Promise<ReturnType<typeof autumnHandler>> | undefined;

// Lazy: keeps autumn-js/fetch out of the eager isolate startup graph;
// resolves instantly after the first request.
function loadHandler() {
  return (handlerPromise ??= import("autumn-js/fetch").then(
    ({ autumnHandler }) =>
      autumnHandler({
        identify: async (request) => {
          const context = contextByRequest.get(request);
          // identify is only reachable via handleAutumnRequest, which resolves
          // first — fail closed rather than re-resolving if that ever breaks.
          if (!context) {
            throw new Error(
              "Autumn identify called without a resolved context",
            );
          }

          return {
            customerId: context.organizationId,
          };
        },
      }),
  ));
}

async function handleAutumnRequest(request: Request) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
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
  contextByRequest.set(request, context);

  const route = new URL(request.url).pathname.split("/").pop() ?? "";
  if (
    !MEMBER_READABLE_AUTUMN_ROUTES.has(route) &&
    !hasOrgPermission(context.role, { billing: ["manage"] })
  ) {
    return Response.json(
      {
        message: "Only the organization owner can manage billing.",
        code: "billing_owner_required",
      },
      { status: 403 },
    );
  }

  return (await loadHandler())(request);
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
