import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setConfigSchema = projectScopedSchema.extend({
  host: z.string().min(1).max(255),
  key: z.string().min(1).max(255),
  keyLocation: z.string().url(),
  enabled: z.boolean().optional(),
});
const submitUrlsSchema = projectScopedSchema.extend({
  urls: z.array(z.string().url()).min(1).max(10_000),
});
const queueSchema = projectScopedSchema.extend({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

export const getIndexNowConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) => IndexNowService.getConfig(context.projectId));

export const setIndexNowConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setConfigSchema)
  .handler(({ data, context }) =>
    IndexNowService.setConfig({
      projectId: context.projectId,
      organizationId: context.organizationId,
      host: data.host,
      key: data.key,
      keyLocation: data.keyLocation,
      enabled: data.enabled,
    }),
  );

export const disableIndexNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) => IndexNowService.disable(context.projectId));

export const verifyIndexNowKey = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) =>
    IndexNowService.verifyKey({ projectId: context.projectId }),
  );

export const submitIndexNowUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(submitUrlsSchema)
  .handler(({ data, context }) =>
    IndexNowService.submitUrls({
      projectId: context.projectId,
      urls: data.urls,
    }),
  );

export const getIndexingQueue = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(queueSchema)
  .handler(({ data, context }) =>
    IndexNowService.getQueue({
      projectId: context.projectId,
      limit: data.limit,
      offset: data.offset,
    }),
  );
