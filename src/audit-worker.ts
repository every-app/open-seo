// Auxiliary worker "open-seo-audit": hosts the entire site-audit engine — the
// SiteAuditWorkflow orchestrator (crawl, Lighthouse, finalize) and the
// per-audit AuditScratchpad DO — so its memory spikes (multi-MB Lighthouse
// payloads, in-flight HTML batches) land on a small-baseline isolate instead
// of the app worker's near-limit one. The app worker starts audits via the
// cross-script SITE_AUDIT_WORKFLOW binding and reads results from the shared
// DB/KV.
//
// Keep this entry's eager graph lean: autumn-js and the page analyzer must
// stay behind their existing lazy boundaries
// (vite-plugin-lean-worker-bundle.ts asserts this at build time).
import { WorkerEntrypoint } from "cloudflare:workers";
import { getAuditScratchpad } from "@/server/features/audit/AuditScratchpad";

export { SiteAuditWorkflow } from "./server/workflows/SiteAuditWorkflow";
export { AuditScratchpad } from "./server/features/audit/AuditScratchpad";

// The scratchpad DO is private to this worker: the Cloudflare API refuses an
// upload that deletes a class while any binding still references its name, so
// the app worker could not keep a cross-script binding through the cutover.
// The app's two control needs (audit delete/cancel, GDPR erasure) go through
// this entrypoint instead. Nothing routes to fetch — the app worker owns all
// traffic.
export default class AuditEngine extends WorkerEntrypoint {
  override fetch(): Response {
    return new Response("Not found", { status: 404 });
  }

  /** Wipe an audit's crawl scratch state (storage + alarm). Idempotent. */
  async destroyScratchpad(auditId: string): Promise<void> {
    await getAuditScratchpad(auditId).destroy();
  }
}
