import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PaaMiningService } from "@/server/features/paa-mining/services/PaaMiningService";
import { PAA_MINING_REGIONS } from "@/shared/paa-mining";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const runScanInputSchema = z.object({
  projectId: z.string().min(1),
  seed: z.string().trim().min(1).max(150),
  region: z.enum(PAA_MINING_REGIONS).optional(),
});

const scanInputSchema = z.object({
  projectId: z.string().min(1),
  scanId: z.string().trim().min(1).max(128),
});

// Module state is deployment-wide (one BYO connection per install, like the
// DataForSEO key), so status and the enable/disable switch are app-scoped
// rather than project-scoped.
export const getPaaMiningStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => PaaMiningService.connectionStatus());

export const setPaaMiningEnabled = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data }) => PaaMiningService.setModuleEnabled(data.enabled));

export const runPaaMiningScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runScanInputSchema)
  .handler(async ({ data }) =>
    PaaMiningService.runScan({
      projectId: data.projectId,
      seed: data.seed,
      region: data.region,
    }),
  );

export const getPaaMiningView = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(scanInputSchema)
  .handler(async ({ data }) =>
    PaaMiningService.getView(data.projectId, data.scanId),
  );

export const deletePaaMiningScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInputSchema)
  .handler(async ({ data }) => {
    await PaaMiningService.deleteScan(data.projectId, data.scanId);
    return { ok: true };
  });

export const listPaaMiningScans = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => PaaMiningService.listHistory(data.projectId));
