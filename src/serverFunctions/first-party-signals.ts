import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { FirstPartySignalsService } from "@/server/features/first-party-signals/FirstPartySignalsService";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectSchema = z.object({ projectId: z.string().min(1) });
const configureSchema = projectSchema.extend({
  name: z.string().trim().min(1).max(80),
  allowedPaths: z.array(z.string().min(1).max(1_024)).min(1).max(100),
});
const revokeSchema = projectSchema.extend({ sourceId: z.string().uuid() });

export const configureFirstPartySignalSource = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(configureSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return FirstPartySignalsService.configureSource({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      name: data.name,
      allowedPaths: data.allowedPaths,
    });
  });

export const listFirstPartySignalSources = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectSchema)
  .handler(({ context }) =>
    FirstPartySignalsService.listSources(context.projectId),
  );

export const revokeFirstPartySignalSource = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(revokeSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await FirstPartySignalsService.revokeSource(
      context.projectId,
      data.sourceId,
    );
    return { revoked: true as const };
  });
