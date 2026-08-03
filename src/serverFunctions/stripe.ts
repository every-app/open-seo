import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  StripeRevenueService,
  StripeNotConnectedError,
} from "@/server/features/revenue/services/StripeRevenueService";
import {
  hasStripeKey,
  isExpectedStripeFailure,
} from "@/server/lib/stripeClient";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setProductsSchema = projectScopedSchema.extend({
  subscriptionProductId: z.string().min(1).nullable(),
  oneOffProductId: z.string().min(1).nullable(),
});

export const getStripeConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, keyConfigured] = await Promise.all([
      StripeRevenueService.getConnection(context.projectId),
      hasStripeKey(),
    ]);
    return {
      connected: Boolean(connection),
      keyConfigured,
      subscriptionProductName: connection?.subscriptionProductName ?? null,
      oneOffProductName: connection?.oneOffProductName ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listStripeProducts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const products = await StripeRevenueService.listProductsForPicker(
      context.projectId,
    );
    return { products };
  });

export const setStripeProducts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setProductsSchema)
  .handler(async ({ data, context }) => {
    const connection = await StripeRevenueService.setProducts({
      projectId: context.projectId,
      organizationId: context.organizationId,
      subscriptionProductId: data.subscriptionProductId,
      oneOffProductId: data.oneOffProductId,
      userId: context.userId,
    });
    return {
      connected: true as const,
      subscriptionProductName: connection.subscriptionProductName,
      oneOffProductName: connection.oneOffProductName,
    };
  });

export const disconnectStripe = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await StripeRevenueService.disconnect(context.projectId);
    return { connected: false as const };
  });

/**
 * Revenue metrics for the mapped Stripe products: active subscribers,
 * 30-day new/churn, and estimated MRR for the subscription product; purchase
 * count and revenue for the one-off product, both vs the prior 30 days.
 * Not connected — or a rejected STRIPE_SECRET_KEY — resolves to
 * { connected: false } so the page renders the setup card instead of an
 * error boundary.
 */
export const getStripeRevenue = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const report = await StripeRevenueService.getRevenue({
        projectId: context.projectId,
      });
      return { connected: true as const, ...report };
    } catch (error) {
      if (
        error instanceof StripeNotConnectedError ||
        isExpectedStripeFailure(error)
      ) {
        return { connected: false as const };
      }
      throw error;
    }
  });
