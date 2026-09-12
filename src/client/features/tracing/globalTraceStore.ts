import { useCallback, useMemo, useSyncExternalStore } from "react";
import type {
  GlobalTraceFeature,
  GlobalTraceFilter,
  GlobalTraceOperation,
  GlobalTraceStatus,
} from "@/shared/globalTraceTypes";
import {
  computeProviderBreakdown,
  filterOperations,
} from "./globalTraceFormat";

const MAX_OPERATIONS = 500;
const DIAGNOSTICS_STORAGE_KEY = "openseo_global_diagnostics_enabled";

type Listener = () => void;

/**
 * Secure-context-safe ID generation for trace/operation records.
 * `crypto.randomUUID` only exists in secure contexts (HTTPS / localhost);
 * on plain-HTTP origins it is undefined and would throw, which must never
 * break the underlying SEO operation being traced.
 */
export function safeTraceId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the Math.random fallback below.
  }
  return `trace_${Date.now().toString(36)}_${Math.floor(
    Math.random() * 0xffffff,
  ).toString(36)}`;
}

export interface GlobalTraceStoreState {
  operations: GlobalTraceOperation[];
  diagnosticsEnabled: boolean;
  activeFilter: GlobalTraceFilter;
  panelOpen: boolean;
}

function getInitialDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY);
    if (stored !== null) {
      return stored === "true";
    }
  } catch {
    // Ignore localStorage access errors
  }
  return true;
}

class GlobalTraceStore {
  private state: GlobalTraceStoreState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = {
      operations: [],
      diagnosticsEnabled: getInitialDiagnosticsEnabled(),
      activeFilter: "all",
      panelOpen: false,
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): GlobalTraceStoreState => {
    return this.state;
  };

  setDiagnosticsEnabled = (enabled: boolean) => {
    if (this.state.diagnosticsEnabled === enabled) return;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, String(enabled));
      } catch {
        // Ignore
      }
    }
    this.state = {
      ...this.state,
      diagnosticsEnabled: enabled,
    };
    this.notify();
  };

  isDiagnosticsEnabled = (): boolean => {
    return this.state.diagnosticsEnabled;
  };

  setPanelOpen = (open: boolean) => {
    if (this.state.panelOpen === open) return;
    this.state = {
      ...this.state,
      panelOpen: open,
    };
    this.notify();
  };

  isPanelOpen = (): boolean => {
    return this.state.panelOpen;
  };

  setActiveFilter = (filter: GlobalTraceFilter) => {
    if (this.state.activeFilter === filter) return;
    this.state = {
      ...this.state,
      activeFilter: filter,
    };
    this.notify();
  };

  getActiveFilter = (): GlobalTraceFilter => {
    return this.state.activeFilter;
  };

  /**
   * Starts a new operation in the trace log.
   * Returns the generated operationId.
   */
  startOperation = (
    input: Omit<
      GlobalTraceOperation,
      "traceId" | "operationId" | "startedAt" | "status"
    > & {
      status?: GlobalTraceStatus;
      operationId?: string;
      startedAt?: number;
    },
  ): string => {
    if (!this.state.diagnosticsEnabled) {
      return input.operationId || safeTraceId();
    }

    try {
      const operationId = input.operationId || safeTraceId();
      const traceId = safeTraceId();
      const startedAt = input.startedAt ?? Date.now();

      const newOp: GlobalTraceOperation = {
        ...input,
        traceId,
        operationId,
        status: input.status ?? "running",
        startedAt,
      };

      let newOps = [newOp, ...this.state.operations];
      if (newOps.length > MAX_OPERATIONS) {
        newOps = newOps.slice(0, MAX_OPERATIONS);
      }

      this.state = {
        ...this.state,
        operations: newOps,
      };
      this.notify();
      return operationId;
    } catch {
      // Diagnostic operations must never throw (and the fallback itself
      // must not throw either — safeTraceId never uses crypto.randomUUID
      // without a capability check).
      return input.operationId || safeTraceId();
    }
  };

  /**
   * Updates an in-flight operation with progress or new metadata.
   */
  updateOperation = (
    operationId: string,
    patch: Partial<GlobalTraceOperation>,
  ) => {
    if (!this.state.diagnosticsEnabled) return;
    try {
      const index = this.state.operations.findIndex(
        (op) => op.operationId === operationId,
      );
      if (index === -1) return;

      const existing = this.state.operations[index];
      const updated: GlobalTraceOperation = {
        ...existing,
        ...patch,
      };

      // Recalculate provider breakdown if providers changed
      if (patch.providers && !patch.providerBreakdown) {
        updated.providerBreakdown = computeProviderBreakdown(patch.providers);
      }

      const newOps = [
        ...this.state.operations.slice(0, index),
        updated,
        ...this.state.operations.slice(index + 1),
      ];

      this.state = {
        ...this.state,
        operations: newOps,
      };
      this.notify();
    } catch {
      // Diagnostic operations must never throw
    }
  };

  /**
   * Completes an operation with a terminal status (success / failed / blocked).
   */
  completeOperation = (
    operationId: string,
    patch: Partial<GlobalTraceOperation> & { status?: GlobalTraceStatus },
  ) => {
    if (!this.state.diagnosticsEnabled) return;
    try {
      const index = this.state.operations.findIndex(
        (op) => op.operationId === operationId,
      );
      if (index === -1) return;

      const existing = this.state.operations[index];
      const completedAt = patch.completedAt ?? Date.now();
      const durationMs =
        patch.durationMs ?? Math.max(0, completedAt - existing.startedAt);

      const updated: GlobalTraceOperation = {
        ...existing,
        ...patch,
        status: patch.status ?? "success",
        completedAt,
        durationMs,
      };

      if (updated.providers && !updated.providerBreakdown) {
        updated.providerBreakdown = computeProviderBreakdown(updated.providers);
      }

      if (updated.providerBreakdown && !updated.provider) {
        updated.provider = updated.providerBreakdown
          .map((item) => `${item.provider} ×${item.count}`)
          .join(" · ");
      }

      const newOps = [
        ...this.state.operations.slice(0, index),
        updated,
        ...this.state.operations.slice(index + 1),
      ];

      this.state = {
        ...this.state,
        operations: newOps,
      };
      this.notify();
    } catch {
      // Diagnostic operations must never throw
    }
  };

  /**
   * Records an already completed operation in a single call.
   */
  recordOperation = (
    op: Omit<GlobalTraceOperation, "traceId" | "operationId"> & {
      operationId?: string;
    },
  ) => {
    if (!this.state.diagnosticsEnabled) return;
    try {
      const operationId = op.operationId || safeTraceId();
      const traceId = safeTraceId();
      const completedAt = op.completedAt ?? Date.now();
      const durationMs = op.durationMs ?? 0;

      const fullOp: GlobalTraceOperation = {
        ...op,
        traceId,
        operationId,
        completedAt,
        durationMs,
      };

      if (fullOp.providers && !fullOp.providerBreakdown) {
        fullOp.providerBreakdown = computeProviderBreakdown(fullOp.providers);
      }

      if (fullOp.providerBreakdown && !fullOp.provider) {
        fullOp.provider = fullOp.providerBreakdown
          .map((item) => `${item.provider} ×${item.count}`)
          .join(" · ");
      }

      let newOps = [fullOp, ...this.state.operations];
      if (newOps.length > MAX_OPERATIONS) {
        newOps = newOps.slice(0, MAX_OPERATIONS);
      }

      this.state = {
        ...this.state,
        operations: newOps,
      };
      this.notify();
    } catch {
      // Diagnostic operations must never throw
    }
  };

  /**
   * Explicitly clears the trace.
   * If a projectId is provided, clears only operations belonging to that project.
   * If not provided, clears all operations.
   */
  clearTrace = (projectId?: string) => {
    try {
      let newOps: GlobalTraceOperation[];
      if (projectId) {
        newOps = this.state.operations.filter(
          (op) => op.projectId !== projectId,
        );
      } else {
        newOps = [];
      }
      this.state = {
        ...this.state,
        operations: newOps,
      };
      this.notify();
    } catch {
      // Diagnostic operations must never throw
    }
  };

  getOperations = (projectId?: string): GlobalTraceOperation[] => {
    if (!projectId) return this.state.operations;
    // Project isolation: return operations for the project or global settings operations
    return this.state.operations.filter(
      (op) => !op.projectId || op.projectId === projectId,
    );
  };

  findActiveOperationByFeature = (
    feature: GlobalTraceFeature,
    projectId?: string,
  ): GlobalTraceOperation | undefined => {
    return this.state.operations.find(
      (op) =>
        op.feature === feature &&
        op.status === "running" &&
        (!projectId || !op.projectId || op.projectId === projectId),
    );
  };
}

export const globalTraceStore = new GlobalTraceStore();

export function useGlobalTrace(projectId?: string) {
  const state = useSyncExternalStore(
    globalTraceStore.subscribe,
    globalTraceStore.getState,
    globalTraceStore.getState,
  );

  const scopedOperations = useMemo(() => {
    return projectId
      ? state.operations.filter(
          (op) => !op.projectId || op.projectId === projectId,
        )
      : state.operations;
  }, [state.operations, projectId]);

  const filteredOperations = useMemo(() => {
    return filterOperations(scopedOperations, state.activeFilter);
  }, [scopedOperations, state.activeFilter]);

  const clearTrace = useCallback(() => {
    globalTraceStore.clearTrace(projectId);
  }, [projectId]);

  return {
    operations: filteredOperations,
    allOperations: scopedOperations,
    totalCount: scopedOperations.length,
    diagnosticsEnabled: state.diagnosticsEnabled,
    activeFilter: state.activeFilter,
    panelOpen: state.panelOpen,
    setDiagnosticsEnabled: globalTraceStore.setDiagnosticsEnabled,
    setActiveFilter: globalTraceStore.setActiveFilter,
    setPanelOpen: globalTraceStore.setPanelOpen,
    clearTrace,
  };
}
