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
import {
  customerHasManagedAccess,
  getOrCreateOrganizationCustomer,
} from "@/server/billing/subscription";

const AUTUMN_EVENTS_LIST_URL = "https://api.useautumn.com/v1/events.list";
const EVENT_PAGE_LIMIT = 1000;
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

// Whether this organization may use the managed product at all. Both the
// legacy free plan (grandfathered users) and the paid base plan grant the
// feature; new customers get no default product and must subscribe.
export const getManagedAccessStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    if (!(await isHostedServerAuthMode())) {
      return { hasManagedAccess: true };
    }

    const customer = await getOrCreateOrganizationCustomer(context);
    return { hasManagedAccess: await customerHasManagedAccess(customer.id) };
  });

export const getBillingUsageEvents = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .inputValidator((data: unknown) => billingUsageRangeSchema.parse(data))
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
  const response = await fetch(AUTUMN_EVENTS_LIST_URL, {
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

  if (!response.ok) {
    throw new AppError(
      "INTERNAL_ERROR",
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
