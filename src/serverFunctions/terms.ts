import { createServerFn } from "@tanstack/react-start";
import { TermsAcceptanceService } from "@/server/auth/terms-acceptance";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const acceptTermsUpdate = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    TermsAcceptanceService.acceptCurrentTerms(context.userId),
  );
