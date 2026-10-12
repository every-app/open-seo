type GoogleIntegrationKey = "google_ads" | "gsc" | "ga4";

type ProbeInput = {
  integration: GoogleIntegrationKey;
  providerId: string;
  projectId: string;
  connectedByUserId: string;
  accountId: string | null;
};

type ReconnectLogInput = {
  integration: GoogleIntegrationKey;
  projectId: string;
  providerId: string;
  accountId: string | null;
  scopeSet: string[];
  error: unknown;
};

type TokenFailureDetails = {
  errorClass: string;
  errorCode: string | null;
  errorSuberror: string | null;
  errorMessage: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractCode(payload: Record<string, unknown>): string | null {
  return (
    readString(payload.code) ??
    readString(payload.error) ??
    readString(payload.status) ??
    null
  );
}

function extractSuberror(payload: Record<string, unknown>): string | null {
  return (
    readString(payload.error_subtype) ??
    readString(payload.error_suberror) ??
    readString(payload.suberror) ??
    null
  );
}

function extractMessage(payload: Record<string, unknown>): string | null {
  return (
    readString(payload.error_description) ??
    readString(payload.message) ??
    readString(payload.cause) ??
    null
  );
}

export function extractTokenFailureDetails(
  error: unknown,
): TokenFailureDetails {
  if (!(error instanceof Error)) {
    return {
      errorClass: "UnknownError",
      errorCode: null,
      errorSuberror: null,
      errorMessage: null,
    };
  }

  const cause = isRecord(error.cause) ? error.cause : null;
  const payload = isRecord(error) ? error : {};
  const nested = cause && isRecord(cause.error) ? cause.error : null;

  return {
    errorClass: error.name || "Error",
    errorCode: extractCode(payload) ?? (cause ? extractCode(cause) : null),
    errorSuberror:
      extractSuberror(payload) ??
      (cause ? extractSuberror(cause) : null) ??
      (nested ? extractSuberror(nested) : null),
    errorMessage:
      extractMessage(payload) ??
      (cause ? extractMessage(cause) : null) ??
      (nested ? extractMessage(nested) : null) ??
      readString(error.message),
  };
}

function redactedTokenSubjectHash(accountId: string | null): string | null {
  if (!accountId) return null;
  let hash = 2166136261;
  for (let i = 0; i < accountId.length; i += 1) {
    hash ^= accountId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function probeRefreshToken(input: ProbeInput): Promise<void> {
  const { getGoogleAccessToken } =
    await import("@/server/features/google/googleOAuth");
  await getGoogleAccessToken({
    providerId: input.providerId,
    userId: input.connectedByUserId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
  });
}

async function getHealthRepository() {
  const module =
    await import("@/server/features/google/repositories/GoogleIntegrationHealthRepository");
  return module.GoogleIntegrationHealthRepository;
}

export async function recordRefreshSuccess(input: ProbeInput) {
  try {
    const repository = await getHealthRepository();
    await repository.markRefreshSuccess(input);
  } catch (error) {
    console.debug("google_integration.health_store_write_failed", error);
  }
}

export async function recordRefreshFailure(
  input: ProbeInput & TokenFailureDetails,
): Promise<number> {
  try {
    const repository = await getHealthRepository();
    return await repository.markRefreshFailure(input);
  } catch (error) {
    console.debug("google_integration.health_store_write_failed", error);
    return 1;
  }
}

export async function probeAndRecordRefreshHealth(input: ProbeInput): Promise<{
  healthy: boolean;
  consecutiveFailures: number;
}> {
  try {
    await probeRefreshToken(input);
    await recordRefreshSuccess(input);
    return { healthy: true, consecutiveFailures: 0 };
  } catch (error) {
    const details = extractTokenFailureDetails(error);
    const consecutiveFailures = await recordRefreshFailure({
      ...input,
      ...details,
    });
    return { healthy: false, consecutiveFailures };
  }
}

export async function getStoredRefreshHealth(input: {
  projectId: string;
  integration: GoogleIntegrationKey;
}) {
  try {
    const repository = await getHealthRepository();
    return repository.getByProjectAndIntegration(input);
  } catch (error) {
    console.debug("google_integration.health_store_read_failed", error);
    return null;
  }
}

export function logReconnectFailure(input: ReconnectLogInput) {
  const details = extractTokenFailureDetails(input.error);
  const tokenSubjectHash = redactedTokenSubjectHash(input.accountId);
  console.error("google_integration.refresh_failed", {
    integration: input.integration,
    projectId: input.projectId,
    providerId: input.providerId,
    accountId: input.accountId,
    tokenSubjectHash,
    scopeSet: input.scopeSet,
    errorClass: details.errorClass,
    errorCode: details.errorCode,
    errorSuberror: details.errorSuberror,
    errorMessage: details.errorMessage,
  });
}
