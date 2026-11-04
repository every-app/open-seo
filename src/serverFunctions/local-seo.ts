import { createServerFn } from "@tanstack/react-start";
import { LocalSeoService } from "@/server/features/local-seo/services/LocalSeoService";
import { requireProjectContext } from "./middleware";
import {
  createLocalTrackerSchema,
  localLookupSchema,
  localProjectSchema,
  localScanIdSchema,
  localTrackerIdSchema,
  startLocalCheckSchema,
  updateLocalKeywordsSchema,
} from "@/types/schemas/local-seo";

export const listLocalTrackers = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localProjectSchema)
  .handler(({ context }) => LocalSeoService.listTrackers(context.projectId));
export const lookupLocalBusiness = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localLookupSchema)
  .handler(({ data, context }) =>
    LocalSeoService.lookupBusiness(
      context.projectId,
      data.query,
      data.locationName,
      context.project.languageCode,
      context,
    ),
  );
export const createLocalTracker = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createLocalTrackerSchema)
  .handler(({ data, context }) =>
    LocalSeoService.createTracker(
      { ...data, projectId: context.projectId },
      context.project.languageCode,
    ),
  );
export const getLocalTracker = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localTrackerIdSchema)
  .handler(({ data, context }) =>
    LocalSeoService.getTracker(context.projectId, data.trackerId),
  );
export const updateLocalKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateLocalKeywordsSchema)
  .handler(({ data, context }) =>
    LocalSeoService.updateKeywords({ ...data, projectId: context.projectId }),
  );
export const startLocalCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(startLocalCheckSchema)
  .handler(({ data, context }) =>
    LocalSeoService.startCheck(
      { ...data, projectId: context.projectId },
      { ...context, projectId: context.projectId },
    ),
  );
export const getLocalScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localScanIdSchema)
  .handler(({ data, context }) =>
    LocalSeoService.getScan(context.projectId, data.scanId),
  );
