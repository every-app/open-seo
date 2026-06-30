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
import type { AuditConfig } from "@/server/lib/audit/types";
import { captureServerEvent } from "@/server/lib/posthog";
import { runAuditPhases } from "@/server/workflows/siteAuditWorkflowPhases";
import { pgStep } from "@/server/workflows/pgStep";

interface AuditParams {
  auditId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
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
    const { auditId, billingCustomer, projectId, startUrl, config } =
      event.payload;

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

    try {
      await runAuditPhases(step, {
        auditId,
        workflowInstanceId: event.instanceId,
        billingCustomer,
        projectId,
        startUrl,
        config,
      });
    } catch (error) {
      console.error(`Audit ${auditId} failed:`, error);
      await pgStep(step, "mark-failed", undefined, async () => {
        await AuditRepository.failAudit(auditId, event.instanceId);

        const latestAudit = await AuditRepository.getAuditForWorkflow(
          auditId,
          event.instanceId,
        );

        await captureServerEvent({
          distinctId: billingCustomer.userId,
          event: "site_audit:complete",
          organizationId: billingCustomer.organizationId,
          properties: {
            project_id: projectId,
            status: "failed",
            pages_crawled: latestAudit?.pagesCrawled,
            pages_total: latestAudit?.pagesTotal,
            run_lighthouse: config.lighthouseStrategy !== "none",
          },
        });
      });
      throw error;
    }
  }
}
