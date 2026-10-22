/**
 * Cloudflare Workflow for site audit crawling.
 *
 * Each step is durable - if a step fails, it retries without redoing
 * completed steps.
 */
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { withPgClient } from "@/db";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  CrawlerCredentialService,
  type SealedCrawlerAccess,
} from "@/server/features/audit/services/CrawlerCredentialService";
import { classifyAuditError } from "@/server/lib/audit/audit-errors";
import {
  settleRenderingLocks,
  type RenderingLock,
} from "@/server/lib/audit/rendering-billing";
import type { AuditConfig } from "@/server/lib/audit/types";
import { captureServerError, captureServerEvent } from "@/server/lib/posthog";
import { runAuditPhases } from "@/server/workflows/siteAuditWorkflowPhases";
import { resolveAuditStart } from "@/server/workflows/siteAuditStart";
import { pgStep } from "@/server/workflows/pgStep";
import {
  DB_STEP,
  SETTLE_RENDERING_STEP,
  START_URL_STEP,
} from "@/server/workflows/auditStepConfigs";
import type { RenderUsage } from "@/shared/audit-rendering";

interface AuditParams {
  auditId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
  /**
   * Crawler-access credential (Shopify signature) for the audited host.
   * Carried in workflow params, never in `config`: config is persisted on the
   * audit row and returned to the client. Params are persisted by the workflow
   * engine too, so the values stay encrypted here and are decrypted in memory
   * below, outside any step whose result would be checkpointed.
   */
  access?: SealedCrawlerAccess | null;
  /** Credits held for a hosted rendered audit, settled when the audit ends. */
  renderLocks?: RenderingLock[];
}

export class SiteAuditWorkflow extends WorkflowEntrypoint<Env, AuditParams> {
  async run(event: WorkflowEvent<AuditParams>, step: WorkflowStep) {
    // Scope a per-request Postgres client for this workflow invocation (no-op in
    // D1 mode). The socket is reclaimed when the invocation ends, so there is
    // nothing to tear down here.
    return withPgClient(() => this.runScoped(event, step));
  }

  private async runScoped(
    event: WorkflowEvent<AuditParams>,
    step: WorkflowStep,
  ) {
    const { auditId, billingCustomer, projectId } = event.payload;
    // Summed from checkpointed chunk results, so a replay rebuilds it exactly.
    const renderUsage: RenderUsage = {
      cloudflareAttempts: 0,
      contextCredits: 0,
    };

    try {
      // Inside a step so the D1 read is retried and replay-cached; a bare
      // read here would re-execute on every replay and a transient failure
      // would kill the instance before the catch below exists.
      await pgStep(step, "validate-context", DB_STEP, async () => {
        const audit = await AuditRepository.getAuditForWorkflow(
          auditId,
          event.instanceId,
        );

        if (!audit) {
          throw new Error("Audit workflow context mismatch");
        }

        if (audit.projectId !== projectId) {
          throw new Error("Audit workflow project mismatch");
        }
      });

      // Probing the site happens here, not when the audit starts, so a
      // slow site never delays the response that starts the audit.
      const { startUrl, config, access } = await pgStep(
        step,
        "resolve-start-url",
        START_URL_STEP,
        () =>
          resolveAuditStart({
            auditId,
            organizationId: billingCustomer.organizationId,
            projectId,
            startUrl: event.payload.startUrl,
            config: event.payload.config,
            access: event.payload.access,
          }),
      );

      await runAuditPhases(step, {
        auditId,
        workflowInstanceId: event.instanceId,
        billingCustomer,
        projectId,
        startUrl,
        config,
        access: await CrawlerCredentialService.openCrawlerAccess(access),
        renderUsage,
      });
    } catch (error) {
      console.error(`Audit ${auditId} failed:`, error);
      // Deploy-time resets are expected churn, not actionable errors.
      const isDeployReset =
        error instanceof Error &&
        error.message.includes(
          "Durable Object reset because its code was updated",
        );
      const errorInfo = classifyAuditError(error);
      await pgStep(step, "mark-failed", DB_STEP, async () => {
        // Read the phase before failAudit stamps currentPhase = "failed".
        const runningAudit = await AuditRepository.getAuditForWorkflow(
          auditId,
          event.instanceId,
        );
        // A completed audit (e.g. cleanup failed after finalize) stays
        // completed, so it gets no failure telemetry either.
        if (runningAudit?.status !== "running") return;
        await AuditRepository.failAudit(auditId, event.instanceId, {
          ...errorInfo,
          failedPhase: runningAudit?.currentPhase ?? null,
        });

        // Workflow entrypoints run outside the server-function middleware, so
        // nothing else forwards this throw to PostHog as a $exception. Captured
        // inside this step: when Cloudflare loses the invocation (internal
        // workflow errors, evicted Durable Objects), the step never runs and the
        // engine replays the audit, which usually completes.
        if (!isDeployReset) {
          await captureServerError(
            error,
            {
              source: "site_audit_workflow",
              audit_id: auditId,
              organization_id: billingCustomer.organizationId,
              project_id: projectId,
            },
            billingCustomer.userId,
          );
        }

        await captureServerEvent({
          distinctId: billingCustomer.userId,
          event: "site_audit:complete",
          organizationId: billingCustomer.organizationId,
          properties: {
            project_id: projectId,
            status: "failed",
            error_code: errorInfo.errorCode,
            failed_phase: runningAudit?.currentPhase,
            pages_crawled: runningAudit?.pagesCrawled,
            pages_total: runningAudit?.pagesTotal,
            run_lighthouse: event.payload.config.lighthouseStrategy !== "none",
          },
        });
      });
      throw error;
    } finally {
      // Once, whether the audit completed or failed, after the failure is
      // recorded. Outside the try so a settlement error cannot fail a
      // completed audit.
      const locks = event.payload.renderLocks ?? [];
      if (locks.length > 0) {
        await pgStep(step, "settle-render-credits", SETTLE_RENDERING_STEP, () =>
          settleRenderingLocks({
            customer: billingCustomer,
            auditId,
            locks,
            usage: renderUsage,
          }),
        );
      }
    }
  }
}
