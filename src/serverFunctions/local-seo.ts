import { createServerFn } from "@tanstack/react-start";
import { LocalGridService } from "@/server/features/local-seo/services/LocalGridService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  archiveLocalGridConfigSchema,
  createLocalGridConfigSchema,
  getLocalGridConfigSchema,
  listLocalGridConfigsSchema,
  updateLocalGridConfigSchema,
} from "@/types/schemas/local-seo";

export const listLocalGridConfigs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listLocalGridConfigsSchema)
  .handler(async ({ context }) => {
    return LocalGridService.listConfigs(context.projectId);
  });

export const getLocalGridConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalGridConfigSchema)
  .handler(async ({ data, context }) => {
    return LocalGridService.getConfig(data.configId, context.projectId);
  });

export const createLocalGridConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createLocalGridConfigSchema)
  .handler(async ({ data, context }) => {
    return LocalGridService.createConfig({
      ...data,
      projectId: context.projectId,
    });
  });

export const updateLocalGridConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateLocalGridConfigSchema)
  .handler(async ({ data, context }) => {
    return LocalGridService.updateConfig({
      ...data,
      projectId: context.projectId,
    });
  });

export const archiveLocalGridConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(archiveLocalGridConfigSchema)
  .handler(async ({ data, context }) => {
    return LocalGridService.archiveConfig(data.configId, context.projectId);
  });
