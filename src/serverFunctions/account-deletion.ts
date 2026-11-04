import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { AccountDeletionService } from "@/server/account-deletion/AccountDeletionService";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// Hosted only: self-hosted operators own their users' data, and Every App
// accounts belong to the gateway.
async function requireHosted() {
  if (!(await isHostedServerAuthMode())) throw new AppError("NOT_FOUND");
}

export const getAccountDeletionStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    await requireHosted();
    return AccountDeletionService.getStatus({
      userId: context.userId,
      headers: getRequest().headers,
    });
  });

export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ confirmEmail: z.string().max(320) }))
  .handler(async ({ data, context }) => {
    await requireHosted();
    return AccountDeletionService.requestDeletion({
      userId: context.userId,
      userEmail: context.userEmail,
      confirmEmail: data.confirmEmail,
      headers: getRequest().headers,
    });
  });
