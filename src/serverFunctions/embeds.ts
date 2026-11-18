import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { EmbedService } from "@/server/features/embeds/EmbedService";
import { requireProjectContext } from "@/serverFunctions/middleware";

// The project's embed link. Only the token comes back; the app builds the URLs
// from its own origin, as it does for report share links. A link publishes
// integration data, so it takes the same role as managing the integrations.

const projectSchema = z.object({ projectId: z.string().min(1) });

export const getEmbedLink = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectSchema)
  .handler(({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return EmbedService.getLink(context.projectId);
  });

export const setEmbedLink = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectSchema.extend({ enabled: z.boolean() }))
  .handler(({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return data.enabled
      ? EmbedService.enableLink(context.projectId, context.userId)
      : EmbedService.disableLink(context.projectId);
  });
