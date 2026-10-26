import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ProductUpdatesService } from "@/server/auth/product-updates";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const setProductUpdatesOptIn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ optIn: z.boolean() }))
  .handler(({ data, context }) =>
    ProductUpdatesService.setOptIn({
      userId: context.userId,
      email: context.userEmail,
      optIn: data.optIn,
    }),
  );
