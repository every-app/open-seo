import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { jsonResponse, readToolBody } from "@/lib/free-tools/server";

type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

/**
 * Anyone can post an address here, and each one becomes a Loops contact, so
 * the form is limited to this site's own pages and to a few tries a minute
 * per visitor. The limiter is the free tools' binding under its own key, so
 * the two don't spend each other's allowance. Fails closed like the tools do:
 * a deployed build without the binding or Cloudflare's client IP refuses.
 */
async function guardSubscribeRequest(
  request: Request,
): Promise<Response | null> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonResponse(
      { error: "Cross-site submissions are not allowed" },
      403,
    );
  }
  const limiter: RateLimiter | undefined = Reflect.get(
    env,
    "BACKLINK_CHECK_RATE_LIMIT",
  );
  const ip = request.headers.get("cf-connecting-ip");
  if (!limiter || !ip) {
    if (import.meta.env.DEV) return null;
    console.error("Missing production abuse protection for subscribe");
    return jsonResponse({ error: "Service temporarily unavailable" }, 503);
  }
  const { success } = await limiter
    .limit({ key: `subscribe:${ip}` })
    .catch(() => ({ success: false }));
  return success
    ? null
    : jsonResponse({ error: "Too many tries. Try again in a minute." }, 429, {
        "Retry-After": "60",
      });
}

const subscribeSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const Route = createFileRoute("/api/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const blocked = await guardSubscribeRequest(request);
        if (blocked) return blocked;
        const body = await readToolBody(request);
        if (body instanceof Response) return body;
        const parsed = subscribeSchema.safeParse(body);

        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: parsed.error.issues[0]?.message }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const loopsApiKey = (env as any).LOOPS_API_KEY as string | undefined;

        if (!loopsApiKey) {
          console.error("Missing LOOPS_API_KEY");
          return new Response(
            JSON.stringify({ error: "Service temporarily unavailable" }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }

        // Newsletter signups join the same Product updates list as the app's
        // email switch, so product-update campaigns have one audience.
        const listId: unknown = Reflect.get(
          env,
          "LOOPS_PRODUCT_UPDATES_LIST_ID",
        );
        const mailingLists =
          typeof listId === "string" && listId.trim()
            ? { [listId.trim()]: true }
            : null;

        try {
          const loopsResponse = await fetch(
            "https://app.loops.so/api/v1/contacts/create",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${loopsApiKey}`,
              },
              body: JSON.stringify({
                email: parsed.data.email,
                source: "openseo-waitlist",
                ...(mailingLists ? { mailingLists } : {}),
              }),
            },
          );

          if (loopsResponse.status === 409) {
            // Already a contact: asking for updates again puts them on the
            // list and resubscribes them.
            if (mailingLists) {
              const updateResponse = await fetch(
                "https://app.loops.so/api/v1/contacts/update",
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${loopsApiKey}`,
                  },
                  body: JSON.stringify({
                    email: parsed.data.email,
                    subscribed: true,
                    mailingLists,
                  }),
                },
              );
              if (!updateResponse.ok) {
                console.error(
                  "Loops contact update error:",
                  await updateResponse.json().catch(() => null),
                );
              }
            }
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!loopsResponse.ok) {
            const loopsError = await loopsResponse.json().catch(() => null);
            console.error("Loops contact creation error:", loopsError);
            return new Response(
              JSON.stringify({
                error: "Failed to subscribe. Please try again.",
              }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("Subscribe endpoint error:", err);
          return new Response(
            JSON.stringify({
              error: "Failed to subscribe. Please try again.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
