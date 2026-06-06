import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { seoGraphAudits } from "@/db/app.schema";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  startSeoGraphAuditSchema,
  getSeoGraphAuditStatusSchema,
  getSeoGraphAuditHistorySchema,
  deleteSeoGraphAuditSchema,
  railwaySeoStatusSchema,
} from "@/types/schemas/seoGraph";

// ─── Railway FastAPI base URL ─────────────────────────────────────────────────
// Set RAILWAY_SEO_API_URL in wrangler.jsonc / Cloudflare dashboard.
// Falls back to the known Railway deployment URL.
const RAILWAY_BASE =
  (env as unknown as { RAILWAY_SEO_API_URL?: string }).RAILWAY_SEO_API_URL ??
  "https://openclaw-api-k30t.onrender.com";

const RAILWAY_API_KEY =
  (env as unknown as { RAILWAY_SEO_API_KEY?: string }).RAILWAY_SEO_API_KEY ??
  "test";

function railwayHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${RAILWAY_API_KEY}`,
  };
}

// ─── startSeoGraphAudit ───────────────────────────────────────────────────────
// 1. Inserts a D1 tracking row (status=pending)
// 2. POSTs to Railway FastAPI → gets run_id
// 3. Updates D1 row with run_id + status=running
// Returns the D1 row id (auditId) for the client to poll.
export const startSeoGraphAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => startSeoGraphAuditSchema.parse(data))
  .handler(async ({ data, context }) => {
    const auditId = crypto.randomUUID();

    // Insert D1 tracking row
    await db.insert(seoGraphAudits).values({
      id: auditId,
      projectId: context.projectId,
      startedByUserId: context.userId,
      domain: data.domain,
      keywordsJson: JSON.stringify(data.keywords),
      status: "pending",
    });

    // POST to Railway FastAPI
    let runId: string | null = null;
    try {
      const res = await fetch(`${RAILWAY_BASE}/api/v1/audit-graph`, {
        method: "POST",
        headers: railwayHeaders(),
        body: JSON.stringify({
          domain: data.domain,
          tenant_id: context.organizationId,
          workspace_id: context.projectId,
          keywords: data.keywords,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as { run_id?: string };
        runId = json.run_id ?? null;
      }
    } catch {
      // Railway unreachable — mark failed
      await db
        .update(seoGraphAudits)
        .set({ status: "failed", errorMessage: "Railway API unreachable" })
        .where(eq(seoGraphAudits.id, auditId));
      throw new Error("Railway SEO API is unreachable. Check RAILWAY_SEO_API_URL.");
    }

    if (!runId) {
      await db
        .update(seoGraphAudits)
        .set({ status: "failed", errorMessage: "Railway did not return run_id" })
        .where(eq(seoGraphAudits.id, auditId));
      throw new Error("Railway SEO API did not return a run_id.");
    }

    // Update D1 with run_id + running status
    await db
      .update(seoGraphAudits)
      .set({ runId, status: "running" })
      .where(eq(seoGraphAudits.id, auditId));

    return { auditId, runId };
  });

// ─── getSeoGraphAuditStatus ───────────────────────────────────────────────────
// Reads D1 row, polls Railway if still running, syncs D1 on terminal state.
export const getSeoGraphAuditStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getSeoGraphAuditStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = await db.query.seoGraphAudits.findFirst({
      where: (t, { and: dand, eq: deq }) =>
        dand(deq(t.id, data.auditId), deq(t.projectId, context.projectId)),
    });

    if (!row) throw new Error("Audit not found");

    // If already terminal, return D1 state directly
    if (row.status === "completed" || row.status === "failed") {
      return row;
    }

    // Poll Railway for live status
    if (row.runId) {
      try {
        const res = await fetch(
          `${RAILWAY_BASE}/api/v1/audit-graph/${row.runId}/status`,
          { headers: railwayHeaders() },
        );

        if (res.ok) {
          const raw = await res.json();
          const parsed = railwaySeoStatusSchema.safeParse(raw);

          if (parsed.success) {
            const { status, routing_path, client_report, error } = parsed.data;

            // Sync D1 on terminal state
            if (status === "completed" || status === "failed") {
              await db
                .update(seoGraphAudits)
                .set({
                  status,
                  routingPath: JSON.stringify(routing_path),
                  clientReport: client_report ?? null,
                  errorMessage: error ?? null,
                  completedAt: new Date().toISOString(),
                })
                .where(eq(seoGraphAudits.id, data.auditId));

              return {
                ...row,
                status,
                routingPath: JSON.stringify(routing_path),
                clientReport: client_report ?? null,
              };
            }

            // Still running — update routing_path in D1 for progress display
            if (routing_path.length > 0) {
              await db
                .update(seoGraphAudits)
                .set({ routingPath: JSON.stringify(routing_path) })
                .where(eq(seoGraphAudits.id, data.auditId));
            }

            return { ...row, status, routingPath: JSON.stringify(routing_path) };
          }
        }
      } catch {
        // Railway unreachable — return stale D1 state
      }
    }

    return row;
  });

// ─── getSeoGraphAuditHistory ──────────────────────────────────────────────────
export const getSeoGraphAuditHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getSeoGraphAuditHistorySchema.parse(data))
  .handler(async ({ context }) => {
    return db
      .select()
      .from(seoGraphAudits)
      .where(eq(seoGraphAudits.projectId, context.projectId))
      .orderBy(desc(seoGraphAudits.startedAt))
      .limit(20);
  });

// ─── deleteSeoGraphAudit ──────────────────────────────────────────────────────
export const deleteSeoGraphAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => deleteSeoGraphAuditSchema.parse(data))
  .handler(async ({ data, context }) => {
    await db
      .delete(seoGraphAudits)
      .where(
        and(
          eq(seoGraphAudits.id, data.auditId),
          eq(seoGraphAudits.projectId, context.projectId),
        ),
      );
    return { success: true };
  });
