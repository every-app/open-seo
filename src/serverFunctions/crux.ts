import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { CruxService } from "@/server/features/crux/services/CruxService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import { cruxProjectInputSchema } from "@/types/schemas/crux";

export const getCruxApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(() => {
    const configured = Boolean(env.CRUX_API_KEY?.trim());
    return { configured };
  });

/** Real-user Core Web Vitals for the project's origin (or a specific URL).
 *  All free Chrome UX Report data — no credits. */
export const getCruxSnapshot = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(cruxProjectInputSchema)
  .handler(({ data, context }) =>
    CruxService.getSnapshot({
      domain: context.project.domain,
      url: data.url,
      formFactor: data.formFactor,
    }),
  );
