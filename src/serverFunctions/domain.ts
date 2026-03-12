import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
import { domainOverviewSchema } from "@/types/schemas/domain";
import { DomainService } from "@/server/features/domain/services/DomainService";

export const getDomainOverview = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => domainOverviewSchema.parse(data))
  .handler(async ({ data }) => DomainService.getOverview(data));
