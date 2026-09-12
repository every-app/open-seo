import { globalTraceStore } from "./globalTraceStore";
import {
  scrubGlobalTraceText,
  type GlobalTraceFeature,
  type GlobalTraceOperation,
} from "@/shared/globalTraceTypes";

// Observational wrapper for one server-backed Settings/service call.
//
// It invokes `call` exactly once and records start/completion in the
// independent global trace store. Tracing failures can never break the
// underlying operation: the store itself swallows errors, and this wrapper
// always rethrows the original call error after recording it.
export interface TraceServerCallInput<T> {
  feature: GlobalTraceFeature;
  operation: string;
  source: string;
  projectId?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
  start?: Partial<GlobalTraceOperation>;
  call: () => Promise<T>;
  mapSuccess?: (result: T) => Partial<GlobalTraceOperation>;
  mapError?: (error: unknown) => Partial<GlobalTraceOperation>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function sanitizeTraceValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubGlobalTraceText(value);
  if (depth >= 3 || !value) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeTraceValue(entry, depth + 1));
  }
  if (isPlainRecord(value)) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "__proto__") continue;
      sanitized[key] = sanitizeTraceValue(entry, depth + 1);
    }
    return sanitized;
  }
  return value;
}

function sanitizeTracePatch(
  patch: Partial<GlobalTraceOperation>,
): Partial<GlobalTraceOperation> {
  const sanitized: Partial<GlobalTraceOperation> = { ...patch };
  if (typeof sanitized.errorMessage === "string") {
    sanitized.errorMessage = scrubGlobalTraceText(sanitized.errorMessage);
  }
  if (typeof sanitized.blockedReason === "string") {
    sanitized.blockedReason = scrubGlobalTraceText(sanitized.blockedReason);
  }
  if (sanitized.providers) {
    sanitized.providers = sanitized.providers.map((provider) => ({
      ...provider,
      statusMessage:
        typeof provider.statusMessage === "string"
          ? scrubGlobalTraceText(provider.statusMessage)
          : provider.statusMessage,
    }));
  }
  if (sanitized.children) {
    sanitized.children = sanitized.children.map((child) => ({
      ...child,
      error:
        typeof child.error === "string"
          ? scrubGlobalTraceText(child.error)
          : child.error,
    }));
  }
  if (sanitized.metadata) {
    const metadata = sanitizeTraceValue(sanitized.metadata);
    if (isPlainRecord(metadata)) sanitized.metadata = metadata;
  }
  return sanitized;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code: unknown = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{2,64}$/.test(code)) {
      return code;
    }
  }
  return undefined;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Operation failed";
}

export function defaultTraceErrorPatch(
  error: unknown,
): Partial<GlobalTraceOperation> {
  return {
    status: "failed",
    errorClass: errorCode(error) ?? "OPERATION_FAILED",
    errorMessage: scrubGlobalTraceText(errorText(error)),
  };
}

export async function traceServerCall<T>(
  input: TraceServerCallInput<T>,
): Promise<T> {
  const sanitizedMetadata = input.metadata
    ? sanitizeTraceValue(input.metadata)
    : undefined;
  const metadata = isPlainRecord(sanitizedMetadata)
    ? sanitizedMetadata
    : undefined;
  const operationId = globalTraceStore.startOperation({
    feature: input.feature,
    source: input.source,
    projectId: input.projectId,
    organizationId: input.organizationId,
    status: "running",
    metadata,
    ...input.start,
    operation: input.operation,
  });

  try {
    const result = await input.call();
    const patch = sanitizeTracePatch(
      input.mapSuccess?.(result) ?? { status: "success" },
    );
    globalTraceStore.completeOperation(operationId, {
      status: "success",
      ...patch,
    });
    return result;
  } catch (error) {
    const patch = sanitizeTracePatch(
      input.mapError?.(error) ?? defaultTraceErrorPatch(error),
    );
    globalTraceStore.completeOperation(operationId, {
      status: "failed",
      ...patch,
    });
    throw error;
  }
}
