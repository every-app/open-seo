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
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import type { AuditConfig } from "@/server/lib/audit/types";
import { runAuditPhases } from "@/server/workflows/siteAuditWorkflowPhases";

interface AuditParams {
  auditId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
}

export class SiteAuditWorkflow extends WorkflowEntrypoint<Env, AuditParams> {
  async run(event: WorkflowEvent<AuditParams>, step: WorkflowStep) {
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
      await step.do("mark-failed", async () => {
        await AuditRepository.failAudit(auditId, event.instanceId);
      });
      throw error;
    }
  }
}
