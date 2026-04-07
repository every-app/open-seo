import { createServerFn } from "@tanstack/react-start";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  buildLighthouseExportFile,
  readStoredLighthousePayload,
} from "@/server/lib/lighthousePayload";
import { AppError } from "@/server/lib/errors";
import { getJsonFromR2 } from "@/server/lib/r2";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  lighthouseAuditExportSchema,
  lighthouseAuditIssueSchema,
} from "@/types/schemas/lighthouse";

async function getAuditLighthouseData(input: {
  projectId: string;
  resultId: string;
}) {
  const site = await AuditRepository.getLighthouseResultById({
    lighthouseResultId: input.resultId,
    projectId: input.projectId,
  });

  if (!site) {
    throw new AppError("NOT_FOUND");
  }

  const r2Key = site.lighthouse.r2Key;
  if (!r2Key) {
    throw new AppError("NOT_FOUND");
  }

  const payloadJson = await getJsonFromR2(r2Key);
  const payload = readStoredLighthousePayload(payloadJson);

  return {
    id: site.lighthouse.id,
    strategy: site.lighthouse.strategy,
    finalUrl: site.page?.url ?? "",
    createdAt: site.audit.startedAt,
    payloadJson,
    payload,
  };
}

export const getAuditLighthouseIssues = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => lighthouseAuditIssueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const lighthouse = await getAuditLighthouseData({
      projectId: context.projectId,
      resultId: data.resultId,
    });

    return {
      id: lighthouse.id,
      finalUrl:
        lighthouse.payload.storedPayload?.metadata.finalUrl ??
        lighthouse.finalUrl,
      strategy: lighthouse.strategy,
      createdAt: lighthouse.createdAt,
      hasIssueDetails: lighthouse.payload.report.hasIssueDetails,
      scores: lighthouse.payload.storedPayload?.scores ?? null,
      metrics: lighthouse.payload.storedPayload?.metrics ?? null,
      issues: lighthouse.payload.report.issues,
    };
  });

export const exportAuditLighthouseIssues = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => lighthouseAuditExportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const lighthouse = await getAuditLighthouseData({
      projectId: context.projectId,
      resultId: data.resultId,
    });

    return buildLighthouseExportFile({
      idField: "resultId",
      idValue: lighthouse.id,
      finalUrl: lighthouse.finalUrl,
      strategy: lighthouse.strategy,
      createdAt: lighthouse.createdAt,
      payloadJson: lighthouse.payloadJson,
      mode: data.mode,
      category: data.mode === "category" ? data.category : undefined,
    });
  });
