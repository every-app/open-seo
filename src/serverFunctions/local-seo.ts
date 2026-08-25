import { createServerFn } from "@tanstack/react-start";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { LocalGridService } from "@/server/features/local-seo/services/LocalGridService";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  archiveLocalGridConfigSchema,
  createLocalGridConfigSchema,
  getLocalGridConfigSchema,
  getLocalGridResultsSchema,
  listLocalGridConfigsSchema,
  triggerLocalGridScanSchema,
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

export const triggerLocalGridScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(triggerLocalGridScanSchema)
  .handler(async ({ data, context }) => {
    const isHosted = await isHostedServerAuthMode();
    if (isHosted && !(await customerHasPaidPlan(context.organizationId))) {
      throw new AppError(
        "PAYMENT_REQUIRED",
        "Upgrade to the paid plan to run local map grid scans",
      );
    }
    return LocalGridService.triggerScan({
      configId: data.configId,
      projectId: context.projectId,
      billingCustomer: context,
    });
  });

export const getLocalGridResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalGridResultsSchema)
  .handler(async ({ data, context }) => {
    return LocalGridService.getResults(data.configId, context.projectId);
  });
