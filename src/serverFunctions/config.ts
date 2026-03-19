import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(() => {
    const configured = Boolean(env.DATAFORSEO_API_KEY?.trim());
    return { configured };
  });
