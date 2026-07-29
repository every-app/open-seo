import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createBrandMonitorConfigSchema,
  getBrandMentionsSchema,
  listBrandMonitorConfigsSchema,
  refreshBrandMentionsSchema,
} from "@/types/schemas/brandMonitoring";
import { BrandMonitoringService } from "@/server/features/brand-monitoring/services/BrandMonitoringService";

export const createBrandMonitorConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createBrandMonitorConfigSchema)
  .handler(async ({ data, context }) =>
    BrandMonitoringService.createConfig({
      projectId: context.projectId,
      query: data.query,
    }),
  );

export const listBrandMonitorConfigs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listBrandMonitorConfigsSchema)
  .handler(async ({ context }) =>
    BrandMonitoringService.listConfigs({ projectId: context.projectId }),
  );

export const refreshBrandMentions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(refreshBrandMentionsSchema)
  .handler(async ({ data, context }) =>
    BrandMonitoringService.refreshMentions({
      projectId: context.projectId,
      configId: data.configId,
    }),
  );

export const getBrandMentions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getBrandMentionsSchema)
  .handler(async ({ data, context }) =>
    BrandMonitoringService.listMentions({
      projectId: context.projectId,
      configId: data.configId,
      sentimentFilter: data.sentimentFilter,
      limit: data.limit,
      offset: data.offset,
    }),
  );
