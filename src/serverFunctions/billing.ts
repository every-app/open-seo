import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import { AppError } from "@/server/lib/errors";
import {
  getRequiredEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

const AUTUMN_EVENTS_LIST_URL = "https://api.useautumn.com/v1/events.list";
const EVENT_PAGE_LIMIT = 1000;
// Autumn rate-limits events.list; back off on 429 before giving up.
const AUTUMN_MAX_RETRIES = 3;
const AUTUMN_RETRY_BACKOFF_MS = 250;
// Cap a server-supplied Retry-After so a bogus value can't stall the Worker.
const AUTUMN_MAX_RETRY_DELAY_MS = 5000;
const BILLING_USAGE_FEATURE_IDS = [
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
] as const;

const billingUsageRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
});

const billingUsagePropertySchema = z.json();

const autumnEventSchema = z
  .object({
    value: z.number(),
    properties: z
      .record(z.string(), billingUsagePropertySchema)
      .optional()
      .default({}),
  })
  .passthrough();

const autumnEventsListResponseSchema = z
  .object({
    list: z.array(autumnEventSchema),
    has_more: z.boolean().optional(),
    hasMore: z.boolean().optional(),
  })
  .passthrough();

export type BillingUsageEvent = {
  value: number;
  properties: Record<string, z.infer<typeof billingUsagePropertySchema>>;
};

export const getBillingUsageEvents = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(billingUsageRangeSchema)
  .handler(async ({ data, context }) => {
    if (!(await isHostedServerAuthMode())) {
      return [];
    }

    const events: BillingUsageEvent[] = [];
    let offset = 0;

    for (;;) {
      const page = await fetchAutumnEventsPage({
        customerId: context.organizationId,
        end: data.end,
        offset,
        start: data.start,
      });

      events.push(...page.list);

      if (!page.hasMore || page.list.length === 0) {
        return events;
      }

      offset += page.list.length;
    }
  });

async function fetchAutumnEventsPage(args: {
  customerId: string;
  end: number;
  offset: number;
  start: number;
}): Promise<{ list: BillingUsageEvent[]; hasMore: boolean }> {
  const secretKey = await getRequiredEnvValue("AUTUMN_SECRET_KEY");

  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(AUTUMN_EVENTS_LIST_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: args.customerId,
        custom_range: {
          end: args.end,
          start: args.start,
        },
        feature_id: BILLING_USAGE_FEATURE_IDS,
        limit: EVENT_PAGE_LIMIT,
        offset: args.offset,
      }),
    });

    if (response.ok) break;

    if (response.status === 429 && attempt < AUTUMN_MAX_RETRIES) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const delayMs = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, AUTUMN_MAX_RETRY_DELAY_MS)
        : AUTUMN_RETRY_BACKOFF_MS * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    throw new AppError(
      response.status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
      `Autumn events.list failed with status ${response.status}`,
    );
  }

  const parsed = autumnEventsListResponseSchema.parse(await response.json());

  return {
    hasMore: parsed.has_more ?? parsed.hasMore ?? false,
    list: parsed.list.map((event) => ({
      value: event.value,
      properties: event.properties,
    })),
  };
}
