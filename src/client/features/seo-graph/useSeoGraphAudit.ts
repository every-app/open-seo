'use client';

/**
 * useSeoGraphAudit — TanStack Query v5 hook
 *
 * Polls getSeoGraphAuditStatus every 2s while status is pending/running.
 * Stops polling automatically on completed/failed.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startSeoGraphAudit,
  getSeoGraphAuditStatus,
  getSeoGraphAuditHistory,
  deleteSeoGraphAudit,
} from "@/serverFunctions/seoGraph";
import type { StartSeoGraphAuditInput } from "@/types/schemas/seoGraph";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SeoGraphAuditRow = {
  id: string;
  projectId: string;
  startedByUserId: string;
  domain: string;
  keywordsJson: string;
  runId: string | null;
  status: "pending" | "running" | "completed" | "failed";
  routingPath: string; // JSON array string
  clientReport: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

// ─── useSeoGraphAudit ─────────────────────────────────────────────────────────

export function useSeoGraphAudit(projectId: string, auditId: string | null) {
  return useQuery({
    queryKey: ["seo-graph-audit", projectId, auditId],
    queryFn: () =>
      getSeoGraphAuditStatus({
        data: { projectId, auditId: auditId! },
      }) as Promise<SeoGraphAuditRow>,
    enabled: !!auditId,
    refetchInterval: (query) => {
      const status = (query.state.data as SeoGraphAuditRow | undefined)?.status;
      return status === "running" || status === "pending" ? 2000 : false;
    },
    retry: (failureCount) => failureCount < 3,
    staleTime: 0,
  });
}

// ─── useSeoGraphAuditHistory ──────────────────────────────────────────────────

export function useSeoGraphAuditHistory(projectId: string) {
  return useQuery({
    queryKey: ["seo-graph-audit-history", projectId],
    queryFn: () =>
      getSeoGraphAuditHistory({ data: { projectId } }) as Promise<
        SeoGraphAuditRow[]
      >,
    staleTime: 30_000,
  });
}

// ─── useStartSeoGraphAudit ────────────────────────────────────────────────────

export function useStartSeoGraphAudit(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<StartSeoGraphAuditInput, "projectId">) =>
      startSeoGraphAudit({ data: { ...input, projectId } }) as Promise<{
        auditId: string;
        runId: string;
      }>,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["seo-graph-audit-history", projectId],
      });
    },
  });
}

// ─── useDeleteSeoGraphAudit ───────────────────────────────────────────────────

export function useDeleteSeoGraphAudit(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (auditId: string) =>
      deleteSeoGraphAudit({ data: { projectId, auditId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["seo-graph-audit-history", projectId],
      });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseRoutingPath(routingPath: string): string[] {
  try {
    return JSON.parse(routingPath) as string[];
  } catch {
    return [];
  }
}

export function routingPathToProgress(routingPath: string): number {
  const nodes = parseRoutingPath(routingPath);
  // 9 total nodes in the graph
  return Math.min(Math.round((nodes.length / 9) * 100), 95);
}
