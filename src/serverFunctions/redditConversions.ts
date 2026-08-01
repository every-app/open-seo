import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { captureRedditConversion } from "@/server/lib/reddit-conversions";
import { redditAttributionSchema } from "@/shared/reddit-attribution";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

const conversionInputSchema = z.object({
  attribution: redditAttributionSchema,
  eventType: z.enum(["SIGN_UP", "PURCHASE"]),
});

export const captureRedditConversionEvent = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(conversionInputSchema)
  .handler(async ({ data, context }) => {
    const status = await captureRedditConversion({
      attribution: data.attribution,
      conversionId: `${data.eventType === "SIGN_UP" ? "signup" : "purchase"}:${context.userId}`,
      email: context.userEmail,
      eventType: data.eventType,
      organizationId: context.organizationId,
      userId: context.userId,
      valueDecimal: data.eventType === "PURCHASE" ? 10 : undefined,
      currency: data.eventType === "PURCHASE" ? "USD" : undefined,
    });

    return { status };
  });
