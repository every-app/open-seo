import type { WorkflowStep } from "cloudflare:workers";
import { discoverUrls, fetchRobotsTxt } from "@/server/lib/audit/discovery";
import { selectPsiSample } from "@/server/lib/audit/psi";
import { getOrigin } from "@/server/lib/audit/url-utils";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import type { AuditConfig, PsiResult } from "@/server/lib/audit/types";
import {
  fetchPsiAndUploadToR2,
  type StepPageResult,
} from "@/server/workflows/site-audit-workflow-helpers";
import { runCrawlPhase } from "@/server/workflows/siteAuditWorkflowCrawl";

const PSI_URL_CONCURRENCY = 6;

function countPsiBatchResults(results: PsiResult[]): {
  completed: number;
  failed: number;
} {
  let completed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.errorMessage) {
      failed += 1;
      continue;
    }
    completed += 1;
  }
  return { completed, failed };
}

type AuditPhasesParams = {
  auditId: string;
  workflowInstanceId: string;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
};

export async function runAuditPhases(
  step: WorkflowStep,
  params: AuditPhasesParams,
) {
  const { auditId, workflowInstanceId, projectId, startUrl, config } = params;
  const origin = getOrigin(startUrl);
  const maxPages = config.maxPages;

  const discovery = await runDiscoveryPhase(
    step,
    auditId,
    workflowInstanceId,
    origin,
    maxPages,
  );
  const robots = await fetchRobotsTxt(origin);
  const allPages = await runCrawlPhase(step, {
    auditId,
    workflowInstanceId,
    origin,
    startUrl,
    maxPages,
    robots,
    sitemapUrls: discovery.sitemapUrls,
  });
  const psiResults = await runPsiPhase(step, {
    auditId,
    workflowInstanceId,
    projectId,
    startUrl,
    config,
    allPages,
  });
  await finalizeAudit(step, auditId, workflowInstanceId, allPages, psiResults);
}

async function runDiscoveryPhase(
  step: WorkflowStep,
  auditId: string,
  workflowInstanceId: string,
  origin: string,
  maxPages: number,
) {
  return step.do("discover-urls", async () => {
    const result = await discoverUrls(origin, maxPages);
    await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
      pagesTotal: Math.min(result.urls.length + 1, maxPages),
      currentPhase: "crawling",
    });
    return { sitemapUrls: result.urls };
  });
}

type PsiPhaseParams = {
  auditId: string;
  workflowInstanceId: string;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
  allPages: StepPageResult[];
};

async function runPsiPhase(
  step: WorkflowStep,
  params: PsiPhaseParams,
): Promise<PsiResult[]> {
  const { auditId, workflowInstanceId, projectId, startUrl, config, allPages } =
    params;
  if (config.psiStrategy === "none" || !config.psiApiKey) return [];

  const psiSample = await selectPsiUrls({
    step,
    auditId,
    workflowInstanceId,
    allPages,
    startUrl,
    strategy: config.psiStrategy,
  });
  const psiWork = psiSample.flatMap((psiUrl) => {
    const page = allPages.find((candidate) => candidate.url === psiUrl);
    if (!page) return [];
    return [{ url: psiUrl, pageId: page.id }];
  });

  const psiResults: PsiResult[] = [];
  let psiCompleted = 0;
  let psiFailed = 0;
  let psiBatchIndex = 0;

  for (let i = 0; i < psiWork.length; i += PSI_URL_CONCURRENCY) {
    const batch = psiWork.slice(i, i + PSI_URL_CONCURRENCY);
    psiBatchIndex += 1;
    const psiBatchResults = await runPsiBatch({
      step,
      psiBatchIndex,
      batch,
      psiApiKey: config.psiApiKey,
      projectId,
      auditId,
    });

    psiResults.push(...psiBatchResults);
    const counts = countPsiBatchResults(psiBatchResults);
    psiFailed += counts.failed;
    psiCompleted += counts.completed;
    await step.do(`psi-progress-batch-${psiBatchIndex}`, async () => {
      await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
        psiCompleted,
        psiFailed,
      });
    });
  }

  return psiResults;
}

async function selectPsiUrls(params: {
  step: WorkflowStep;
  auditId: string;
  workflowInstanceId: string;
  allPages: StepPageResult[];
  startUrl: string;
  strategy: AuditConfig["psiStrategy"];
}) {
  const { step, auditId, workflowInstanceId, allPages, startUrl, strategy } =
    params;
  return step.do("select-psi-sample", async () => {
    const pagesForSample = allPages.map((page) => ({
      id: page.id,
      url: page.url,
      statusCode: page.statusCode,
    }));
    const sample = selectPsiSample(pagesForSample, startUrl, strategy);

    await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
      currentPhase: "psi",
      psiTotal: sample.length * 2,
      psiCompleted: 0,
      psiFailed: 0,
    });
    return sample;
  });
}

async function runPsiBatch(params: {
  step: WorkflowStep;
  psiBatchIndex: number;
  batch: Array<{ url: string; pageId: string }>;
  psiApiKey: string;
  projectId: string;
  auditId: string;
}) {
  const { step, psiBatchIndex, batch, psiApiKey, projectId, auditId } = params;
  return step.do(`psi-batch-${psiBatchIndex}`, async () => {
    const perUrlResults = await Promise.all(
      batch.map(async ({ url, pageId }) => {
        const [mobileResult, desktopResult] = await Promise.all([
          fetchPsiAndUploadToR2(url, pageId, "mobile", psiApiKey, {
            projectId,
            auditId,
          }),
          fetchPsiAndUploadToR2(url, pageId, "desktop", psiApiKey, {
            projectId,
            auditId,
          }),
        ]);
        return [mobileResult, desktopResult];
      }),
    );

    return perUrlResults.flat();
  });
}

async function finalizeAudit(
  step: WorkflowStep,
  auditId: string,
  workflowInstanceId: string,
  allPages: StepPageResult[],
  psiResults: PsiResult[],
) {
  await step.do("finalize", async () => {
    await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
      currentPhase: "finalizing",
    });
    await AuditRepository.batchWriteResults(auditId, allPages, psiResults);
    await AuditRepository.completeAudit(auditId, workflowInstanceId, {
      pagesCrawled: allPages.length,
      pagesTotal: allPages.length,
    });
    await AuditProgressKV.clear(auditId);
  });
}
