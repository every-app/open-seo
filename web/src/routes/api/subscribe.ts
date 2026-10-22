import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";

const subscribeSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const Route = createFileRoute("/api/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
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
