import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { getLoginLinkAccount } from "@/server/stripe-projects/service";

// Public: the visitor isn't signed in yet. The token is the credential.
export const getStripeProjectsLoginAccount = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) =>
    (await isHostedServerAuthMode()) ? getLoginLinkAccount(data.token) : null,
  );
