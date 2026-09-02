import { createServerFn } from "@tanstack/react-start";
import { AgentMarketplaceService } from "@/server/features/agent-marketplaces/services/AgentMarketplaceService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  addAgentMarketplaceEvidenceSchema,
  listAgentMarketplacesSchema,
  updateAgentMarketplaceSchema,
} from "@/types/schemas/agent-marketplaces";

export const listAgentMarketplaces = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listAgentMarketplacesSchema)
  .handler(({ context }) => AgentMarketplaceService.list(context.projectId));

export const updateAgentMarketplace = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateAgentMarketplaceSchema)
  .handler(({ data, context }) =>
    AgentMarketplaceService.update({ ...data, projectId: context.projectId }),
  );

export const addAgentMarketplaceEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addAgentMarketplaceEvidenceSchema)
  .handler(({ data, context }) =>
    AgentMarketplaceService.addEvidence({
      ...data,
      projectId: context.projectId,
    }),
  );
