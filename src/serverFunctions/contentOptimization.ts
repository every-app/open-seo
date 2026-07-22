import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ContentOptimizationService } from "@/server/features/content-optimization/services/ContentOptimizationService";
import { CONTENT_SCAN_REGIONS } from "@/shared/content-optimization";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

export type { OnPageReport } from "@/server/lib/onpage/client";

const startScanInputSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().trim().url().max(2048),
  keyword: z.string().trim().min(1).max(150),
  region: z.enum(CONTENT_SCAN_REGIONS).optional(),
});

const jobInputSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().trim().min(1).max(128),
});

// Module state is deployment-wide (one BYO connection per install, like the
// DataForSEO key), so status and the enable/disable switch are app-scoped
// rather than project-scoped.
export const getContentOptimizationStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => ContentOptimizationService.connectionStatus());

export const setContentOptimizationEnabled = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data }) =>
    ContentOptimizationService.setModuleEnabled(data.enabled),
  );

export const startContentScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(startScanInputSchema)
  .handler(async ({ data }) =>
    ContentOptimizationService.startScan({
      projectId: data.projectId,
      url: data.url,
      keyword: data.keyword,
      region: data.region,
    }),
  );

export const getContentScanView = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(jobInputSchema)
  .handler(async ({ data }) =>
    ContentOptimizationService.getView(data.projectId, data.jobId),
  );

export const startOnPageConnect = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => ContentOptimizationService.startConnect());

export const pollOnPageConnect = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      code: z.string().trim().min(4).max(20),
      pollSecret: z.string().trim().min(16).max(128),
    }),
  )
  .handler(async ({ data }) =>
    ContentOptimizationService.pollConnect({
      code: data.code,
      pollSecret: data.pollSecret,
    }),
  );

export const deleteContentScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(jobInputSchema)
  .handler(async ({ data }) => {
    await ContentOptimizationService.deleteScan(data.projectId, data.jobId);
    return { ok: true };
  });

export const listContentScans = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) =>
    ContentOptimizationService.listHistory(data.projectId),
  );
