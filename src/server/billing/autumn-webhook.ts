import { z } from "zod";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { captureServerError } from "@/server/lib/posthog";
import { syncAutumnCustomerStatus } from "./customer-status-sync";
import { verifySvixSignature } from "./svix";

export const AUTUMN_WEBHOOK_PATH = "/api/autumn/webhook";

const autumnWebhookPayloadSchema = z
  .object({
    type: z.string(),
    data: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .passthrough();

type AutumnWebhookPayload = z.infer<typeof autumnWebhookPayloadSchema>;

export async function handleAutumnWebhookRequest(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      headers: { Allow: "POST" },
      status: 405,
    });
  }

  const rawPayload = await request.text();
  const webhookSecret = await getRequiredEnvValue("AUTUMN_WEBHOOK_SECRET");
  const isVerified = await verifySvixSignature({
    headers: request.headers,
    payload: rawPayload,
    secret: webhookSecret,
  });

  if (!isVerified) {
    return json({ error: "Invalid webhook signature" }, 401);
  }

  let payload: AutumnWebhookPayload;
  try {
    payload = autumnWebhookPayloadSchema.parse(JSON.parse(rawPayload));
  } catch {
    return json({ error: "Invalid webhook payload" }, 400);
  }

  // Re-syncing the customer's current state from Autumn is idempotent, so a
  // replayed or out-of-order webhook simply converges to the same row — no
  // dedup table needed. Svix retries on a non-2xx response.
  if (payload.type === "billing.updated") {
    const customerId = getCustomerId(payload);
    if (!customerId) {
      return json({ error: "Missing customer_id" }, 400);
    }

    try {
      await syncAutumnCustomerStatus(customerId);
    } catch (error) {
      // Drizzle truncates its own message to "Failed query:"; the real driver
      // detail (postgres.js code/constraint) lives on error.cause, so log that
      // explicitly. Also forward to PostHog — this raw handler runs outside the
      // server-function middleware, so nothing else captures it as a $exception.
      console.error("Autumn billing.updated sync failed", customerId, error, {
        cause: error instanceof Error ? error.cause : undefined,
      });
      await captureServerError(error, {
        source: "autumn_webhook",
        customer_id: customerId,
      });
      return json({ error: "Webhook processing failed" }, 500);
    }
  }

  return json({ received: true });
}

function getCustomerId(payload: AutumnWebhookPayload) {
  const value = payload.data.customer_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
