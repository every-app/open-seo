import { scrubGlobalTraceText } from "./globalTraceTypes";

export interface ParsedDataforseoDiagnostics {
  provider: string;
  endpoint: string;
  httpStatus: number | null;
  dataforseoStatusCode: number | null;
  dataforseoStatusMessage: string;
  transport: "HTTP" | "DNS" | "TIMEOUT" | "TLS" | "CONNECTION";
  errorClass: string;
  durationMs?: number;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function parseJsonRecord(trimmed: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractMessageFromRecord(record: Record<string, unknown>): string | undefined {
  const errObj = isRecord(record.error) ? record.error : null;
  const msg =
    record.status_message ||
    record.message ||
    errObj?.message ||
    record.error ||
    record.errorMessage ||
    record.description;
  return typeof msg === "string" && msg.trim() ? msg.trim() : undefined;
}

function extractCodeFromRecord(record: Record<string, unknown>): number | null {
  const errObj = isRecord(record.error) ? record.error : null;
  const code =
    record.status_code ??
    record.statusCode ??
    record.code ??
    errObj?.code;
  return typeof code === "number" ? code : null;
}

function extractNonJsonMessage(trimmed: string): string | undefined {
  const titleMatch = /<title>(.*?)<\/title>/i.exec(trimmed);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }
  if (!trimmed.startsWith("<")) {
    return trimmed.slice(0, 150).trim();
  }
  const textOnly = trimmed.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return textOnly ? textOnly.slice(0, 150).trim() : undefined;
}

function resolveInitialErrorClass(status: number): string {
  if (status >= 500) return "TRANSIENT_UPSTREAM";
  if (status === 429) return "RATE_LIMITED";
  if (status === 402) return "CREDITS_UNAVAILABLE";
  if (status === 401) return "DATAFORSEO_AUTH_FAILED";
  if (status === 200) return "TASK_ERROR";
  return "EXECUTION_FAILED";
}

/**
 * Extract safe, credential-scrubbed status code, status message, and error class
 * from a raw HTTP response body or app status object.
 */
export function extractSafeDataforseoErrorMessage(
  status: number,
  rawText: string,
  appStatus?: { statusCode?: number; statusMessage?: string },
): { statusCode: number | null; statusMessage: string; errorClass: string } {
  let errorClass = resolveInitialErrorClass(status);
  let statusCode: number | null = appStatus?.statusCode ?? null;
  let statusMessage: string | undefined = appStatus?.statusMessage;
  const trimmed = rawText.trim();

  if (!statusMessage && trimmed !== "") {
    const record = parseJsonRecord(trimmed);
    if (record) {
      statusMessage = extractMessageFromRecord(record);
      if (statusCode === null) {
        statusCode = extractCodeFromRecord(record);
      }
    } else {
      statusMessage = extractNonJsonMessage(trimmed);
    }
  }

  if (!statusMessage) {
    if (trimmed === "") {
      statusMessage = "no response body";
    } else {
      statusMessage = `HTTP ${status} error`;
    }
  }

  // Application task error inside HTTP 200 with credit issues
  if (status === 200 && (statusCode === 40200 || statusCode === 40201)) {
    errorClass = "CREDITS_UNAVAILABLE";
  } else if (
    status === 200 &&
    (statusMessage.toLowerCase().includes("precaution") ||
      statusMessage.toLowerCase().includes("unusual activity") ||
      statusMessage.toLowerCase().includes("paused access") ||
      statusMessage.toLowerCase().includes("payment") ||
      statusMessage.toLowerCase().includes("credit"))
  ) {
    errorClass = "CREDITS_UNAVAILABLE";
  }

  return {
    statusCode,
    statusMessage: scrubGlobalTraceText(statusMessage),
    errorClass,
  };
}

/**
 * Format a canonical DataForSEO HTTP error message string.
 */
export function formatDataforseoHttpErrorMessage(
  status: number,
  path: string,
  safeMessage: string,
  statusCode: number | null,
): string {
  const codeSuffix = statusCode !== null ? ` (${statusCode})` : "";
  if (safeMessage === "no response body") {
    return `DataForSEO HTTP ${status} on ${path} (no response body)`;
  }
  return `DataForSEO HTTP ${status} on ${path}: ${safeMessage}${codeSuffix}`;
}

/**
 * Format a canonical DataForSEO task-level error message string.
 */
export function formatDataforseoTaskErrorMessage(
  statusCode: number,
  message: string,
): string {
  const scrubbed = scrubGlobalTraceText(message);
  return `DataForSEO task error (${statusCode}): ${scrubbed}`;
}

function parseTransportFailure(
  scrubbed: string,
  endpoint: string,
): ParsedDataforseoDiagnostics | null {
  if (/DNS_LOOKUP_FAILED|ENOTFOUND|getaddrinfo/i.test(scrubbed)) {
    return {
      provider: "DataForSEO",
      endpoint,
      httpStatus: null,
      dataforseoStatusCode: null,
      dataforseoStatusMessage: "DNS resolution failed",
      transport: "DNS",
      errorClass: "TRANSPORT_ERROR",
    };
  }
  if (/TIMEOUT|timed?\s*out|deadline/i.test(scrubbed)) {
    return {
      provider: "DataForSEO",
      endpoint,
      httpStatus: null,
      dataforseoStatusCode: null,
      dataforseoStatusMessage: "Request timed out",
      transport: "TIMEOUT",
      errorClass: "TRANSPORT_ERROR",
    };
  }
  if (/CONNECTION_FAILED|ECONNREFUSED|ECONNRESET|fetch failed/i.test(scrubbed)) {
    return {
      provider: "DataForSEO",
      endpoint,
      httpStatus: null,
      dataforseoStatusCode: null,
      dataforseoStatusMessage: "Connection failed",
      transport: "CONNECTION",
      errorClass: "TRANSPORT_ERROR",
    };
  }
  if (/TLS_FAILED|SSL|certificate/i.test(scrubbed)) {
    return {
      provider: "DataForSEO",
      endpoint,
      httpStatus: null,
      dataforseoStatusCode: null,
      dataforseoStatusMessage: "TLS handshake failed",
      transport: "TLS",
      errorClass: "TRANSPORT_ERROR",
    };
  }
  return null;
}

function parseKeywordFallbackError(
  scrubbed: string,
  endpoint: string,
): ParsedDataforseoDiagnostics | null {
  const lower = scrubbed.toLowerCase();
  const isCreditHeuristic =
    lower.includes("402") ||
    lower.includes("precaution") ||
    lower.includes("unusual activity") ||
    lower.includes("paused access") ||
    lower.includes("payment") ||
    lower.includes("credit");

  if (isCreditHeuristic) {
    const is402Http = lower.includes("402") && !lower.includes("40201");
    return {
      provider: "DataForSEO",
      endpoint,
      httpStatus: is402Http ? 402 : 200,
      dataforseoStatusCode: is402Http ? 40200 : 40201,
      dataforseoStatusMessage: scrubbed || "DataForSEO credits unavailable",
      transport: "HTTP",
      errorClass: "CREDITS_UNAVAILABLE",
    };
  }

  if (lower.includes("429") || lower.includes("rate limit")) {
    return {
      provider: "DataForSEO",
      endpoint,
      httpStatus: 429,
      dataforseoStatusCode: 42900,
      dataforseoStatusMessage: scrubbed || "Rate limit exceeded",
      transport: "HTTP",
      errorClass: "RATE_LIMITED",
    };
  }

  return null;
}

/**
 * Parse a full error message (from run.errorMessage or caught exception)
 * into structured diagnostics for Global Debug Trace.
 */
export function parseDataforseoDiagnosticsFromErrorMessage(
  errorMessage: string | undefined | null,
): ParsedDataforseoDiagnostics {
  const raw = errorMessage ?? "";
  const scrubbed = scrubGlobalTraceText(raw);

  const defaultEndpoint = "v3/serp/google/organic/live/advanced";

  // 1. DataForSEO HTTP <status> on <path>: <message> (<code?>)
  // or DataForSEO HTTP <status> on <path> (no response body)
  const httpMatch =
    /DataForSEO HTTP (\d{3})(?: on ([^\s:]+))?(?:(?:: (?:(.*?)\s*\((\d+)\)|(.*)))|(?: \((no response body)\)))?/.exec(
      scrubbed,
    );
  if (httpMatch) {
    const httpStatus = parseInt(httpMatch[1], 10);
    const endpoint = (httpMatch[2] ? httpMatch[2].replace(/^\//, "") : defaultEndpoint);
    const isNoBody = httpMatch[6] === "no response body" || scrubbed.includes("(no response body)");
    const parsedCode = httpMatch[4] ? parseInt(httpMatch[4], 10) : null;
    const msg = isNoBody
      ? "no response body"
      : (httpMatch[3]?.trim() || httpMatch[5]?.trim() || `HTTP ${httpStatus} error`);

    let errorClass = "EXECUTION_FAILED";
    if (httpStatus >= 500) {
      errorClass = "TRANSIENT_UPSTREAM";
    } else if (httpStatus === 429) {
      errorClass = "RATE_LIMITED";
    } else if (httpStatus === 402) {
      errorClass = "CREDITS_UNAVAILABLE";
    } else if (httpStatus === 401) {
      errorClass = "DATAFORSEO_AUTH_FAILED";
    }

    return {
      provider: "DataForSEO",
      endpoint,
      httpStatus,
      dataforseoStatusCode: parsedCode,
      dataforseoStatusMessage: msg,
      transport: "HTTP",
      errorClass,
    };
  }

  // 2. DataForSEO task error (<statusCode>): <message>
  const taskMatch = /DataForSEO task error \((\d+)\):\s*(.*)/.exec(scrubbed);
  if (taskMatch) {
    const dataforseoStatusCode = parseInt(taskMatch[1], 10);
    const dataforseoStatusMessage = taskMatch[2].trim();
    const isCredit =
      dataforseoStatusCode === 40200 ||
      dataforseoStatusCode === 40201 ||
      dataforseoStatusMessage.toLowerCase().includes("precaution") ||
      dataforseoStatusMessage.toLowerCase().includes("unusual activity") ||
      dataforseoStatusMessage.toLowerCase().includes("paused access") ||
      dataforseoStatusMessage.toLowerCase().includes("payment") ||
      dataforseoStatusMessage.toLowerCase().includes("credit");

    return {
      provider: "DataForSEO",
      endpoint: defaultEndpoint,
      httpStatus: 200,
      dataforseoStatusCode,
      dataforseoStatusMessage,
      transport: "HTTP",
      errorClass: isCredit ? "CREDITS_UNAVAILABLE" : "TASK_ERROR",
    };
  }

  // 3. Transport failures (no HTTP response arrived)
  const transportFailure = parseTransportFailure(scrubbed, defaultEndpoint);
  if (transportFailure) return transportFailure;

  // 4. Keyword check fallback error inspection
  const keywordFallback = parseKeywordFallbackError(scrubbed, defaultEndpoint);
  if (keywordFallback) return keywordFallback;

  // 5. Default generic failure
  return {
    provider: "DataForSEO",
    endpoint: defaultEndpoint,
    httpStatus: 500,
    dataforseoStatusCode: null,
    dataforseoStatusMessage: scrubbed || "DataForSEO server error",
    transport: "HTTP",
    errorClass: "TRANSIENT_UPSTREAM",
  };
}
