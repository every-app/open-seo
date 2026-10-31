import { createServerFn } from "@tanstack/react-start";
import { hasDataforseoAccess } from "@/server/lib/provider-access";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    const configured = await hasDataforseoAccess();
    return { configured };
  });
