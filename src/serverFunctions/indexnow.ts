import { createServerFn } from "@tanstack/react-start";
import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  indexNowProjectSchema,
  submitIndexNowUrlsSchema,
} from "@/types/schemas/indexnow";

export const getIndexNowSetup = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => IndexNowService.getSetup(context));

export const checkIndexNowKeyFiles = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => IndexNowService.checkKeyFiles(context));

export const setUpIndexNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => IndexNowService.setUp(context));

export const submitIndexNowUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(submitIndexNowUrlsSchema)
  .handler(async ({ data, context }) =>
    IndexNowService.submitUrls(context, data.urls),
  );
