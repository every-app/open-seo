import { createServerFn } from "@tanstack/react-start";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { IndexNowService } from "@/server/features/indexnow/IndexNowService";
import {
  configureIndexNowSchema,
  indexNowProjectSchema,
  submitIndexNowSchema,
} from "@/shared/indexnow";
import { requireProjectContext } from "@/serverFunctions/middleware";

export const getIndexNowStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => IndexNowService.getStatus(context.projectId));

export const configureIndexNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(configureIndexNowSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return IndexNowService.configure({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      keyLocation: data.keyLocation,
    });
  });

export const verifyIndexNowKey = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return IndexNowService.verifyKey(context.projectId);
  });

export const submitIndexNowUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(submitIndexNowSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return IndexNowService.submit({
      projectId: context.projectId,
      userId: context.userId,
      urls: data.urls,
      confirmed: data.confirmed,
    });
  });
