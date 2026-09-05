import { InvalidToolInputError, NoSuchToolError } from "ai";

// Tool-request failure classification (Phase V), extracted from
// providerErrors.ts so the provider classifier stays under its file-size
// bound. providerErrors.normalizeProviderError calls classifyToolInputError
// BEFORE every provider signal: a tool-input failure never involves the
// provider, so no later heuristic may claim it.
//
// Incident 2026-09-02 (powersiment.ae): the model sent tool requests whose
// arguments failed Zod validation BEFORE execute() ran (list_saved_keywords
// limit:200; get_serp_results with bare-string / {q:…} query objects). The AI
// SDK rejects those as InvalidToolInputError / NoSuchToolError — and because
// the old text heuristic matched the bare word "tool", every one was labeled
// "<provider> does not support a required feature (such as tool calling)",
// blaming a provider that was never called. These failures classify as
// TOOL_INPUT_INVALID: no provider blame, no capability claim, and the safe
// field-level validation detail is kept so the model (and the user) can see
// exactly what to fix.

export type ToolInputClassification = {
  /** The composed curated message (safe for UI, model, and DO transcript). */
  message: string;
  /** Tool the request named, when the SDK reported it. */
  toolName: string | null;
};

/** Max length of the validation detail carried in the curated message. */
const TOOL_INPUT_DETAIL_MAX = 240;
/** Max issues rendered from a validation payload. */
const TOOL_INPUT_MAX_ISSUES = 3;

/** Marker-symbol names of the AI SDK's tool-request errors (duck-typed). */
const TOOL_INPUT_ERROR_NAMES = new Set([
  "AI_InvalidToolInputError",
  "AI_NoSuchToolError",
  "AI_ToolCallRepairError",
]);

/** Stringified-form prefixes of the same SDK errors (Think flattens to text). */
const TOOL_INPUT_TEXT_PATTERNS: RegExp[] = [
  /Invalid input for tool \S+/i,
  /Model tried to call unavailable tool/i,
  /Error repairing tool call/i,
];

type ToolInputFailure = {
  kind: "invalid-input" | "no-such-tool" | "repair";
  toolName: string | null;
  /** Raw text for the validation payload, when present. */
  causeText: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  if (isRecord(error)) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return "";
}

function nameOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const name = value.name;
  return typeof name === "string" ? name : undefined;
}

function stringProperty(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const property = value[key];
  return typeof property === "string" ? property : null;
}

function toolNameFromText(rawText: string): string | null {
  const invalidInput = rawText.match(/Invalid input for tool (\S+?):/);
  if (invalidInput) return invalidInput[1];
  const unavailable = rawText.match(/unavailable tool '([^']+)'/);
  if (unavailable) return unavailable[1];
  return null;
}

/**
 * Detect a tool-request failure — arguments that failed schema validation
 * (InvalidToolInputError), a request for a tool that does not exist
 * (NoSuchToolError), or a failed tool-call repair (ToolCallRepairError).
 * Works on SDK instances (the official isInstance predicates are keyed on
 * Symbol.for global markers, so they survive duplicated SDK copies across
 * bundle graphs), duck-typed error objects, and the stringified forms Think
 * surfaces in-stream.
 */
function classifyToolInputFailure(
  error: unknown,
  candidates: Record<string, unknown>[],
  rawText: string,
): ToolInputFailure | null {
  // Official predicates first: exact SDK classes with stable toolName fields.
  if (InvalidToolInputError.isInstance(error)) {
    return {
      kind: "invalid-input",
      toolName: error.toolName,
      causeText: textOf(error),
    };
  }
  if (NoSuchToolError.isInstance(error)) {
    return { kind: "no-such-tool", toolName: error.toolName, causeText: null };
  }

  // Duck-typed copies of the same classes (name + shape, no imports).
  const allRecords = [error, ...candidates];
  for (const record of allRecords) {
    if (record === null || typeof record !== "object") continue;
    const name = nameOf(record);
    if (name !== undefined && TOOL_INPUT_ERROR_NAMES.has(name)) {
      if (name === "AI_NoSuchToolError") {
        return {
          kind: "no-such-tool",
          toolName: stringProperty(record, "toolName"),
          causeText: null,
        };
      }
      const message = stringProperty(record, "message");
      return {
        kind: "invalid-input",
        toolName:
          stringProperty(record, "toolName") ?? toolNameFromText(message ?? ""),
        causeText: message,
      };
    }
  }

  // Stringified forms: the same SDK messages flattened to text by the seams.
  if (TOOL_INPUT_TEXT_PATTERNS.some((pattern) => pattern.test(rawText))) {
    if (/Model tried to call unavailable tool/i.test(rawText)) {
      return {
        kind: "no-such-tool",
        toolName: toolNameFromText(rawText),
        causeText: null,
      };
    }
    if (/Error repairing tool call/i.test(rawText)) {
      return {
        kind: "repair",
        toolName: toolNameFromText(rawText),
        causeText: rawText,
      };
    }
    return {
      kind: "invalid-input",
      toolName: toolNameFromText(rawText),
      causeText: rawText,
    };
  }
  return null;
}

/** Collapse whitespace so a multi-line validation payload renders inline. */
function singleLine(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function boundDetail(text: string): string {
  const collapsed = singleLine(text);
  return collapsed.length > TOOL_INPUT_DETAIL_MAX
    ? `${collapsed.slice(0, TOOL_INPUT_DETAIL_MAX)}…`
    : collapsed;
}

type ValidationIssue = Record<string, unknown>;

function isValidationIssues(value: unknown): value is ValidationIssue[] {
  return Array.isArray(value) && value.every((issue) => isRecord(issue));
}

function issueLine(issue: ValidationIssue): string {
  const path = Array.isArray(issue.path)
    ? issue.path.map((segment) => String(segment)).join(".")
    : "";
  let message =
    typeof issue.message === "string" && issue.message.trim() !== ""
      ? issue.message
      : "Invalid input";
  // Union failures bury the useful expectations in per-option sub-errors.
  if (issue.code === "invalid_union" && Array.isArray(issue.errors)) {
    const expected: string[] = [];
    for (const option of issue.errors) {
      if (!Array.isArray(option)) continue;
      for (const sub of option) {
        if (!isRecord(sub)) continue;
        const subMessage = typeof sub.message === "string" ? sub.message : "";
        const match = subMessage.match(/expected (.+)$/i);
        const value = match?.[1]?.trim();
        if (value && !expected.includes(value)) expected.push(value);
      }
    }
    if (expected.length > 0) {
      message = `Invalid input: expected ${expected.join(" | ")}`;
    }
  }
  // Zod issues carry schema facts only (paths, expected types, allowed
  // values) — the received values are never serialized into them.
  const line = path !== "" ? `${path}: ${message}` : message;
  return singleLine(line);
}

/**
 * Extract a safe, compact validation digest from the raw error text. The
 * Zod/validator issue payload embedded in "Invalid input for tool X: …"
 * names the failing fields and what was expected — exactly what the model
 * needs to self-correct and safe to show: no input values, no stacks, no
 * provider data. Unparseable payloads degrade to a bounded slice.
 */
function validationDetail(causeText: string | null): string | null {
  if (!causeText) return null;
  // The SDK's validator form ("Type validation failed: Value: …") echoes the
  // raw arguments in "Value:" — drop that prefix and keep only the
  // "Error message:" tail, which holds the issue payload.
  const withoutValueEcho = causeText.replace(
    /Type validation failed:.*?Error message:/is,
    "",
  );
  const texts = [withoutValueEcho, causeText];
  for (const text of texts) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      if (!isValidationIssues(parsed)) continue;
      const lines = parsed.map(issueLine);
      const render = (count: number): string => {
        const shown = lines.slice(0, count);
        const overflow = lines.length - shown.length;
        const joined = shown.join("; ");
        return overflow > 0 ? `${joined} (+${overflow} more)` : joined;
      };
      // Fit within the bound; when lines must drop, keep dropping shown
      // issues until the overflow marker itself fits inside it.
      let count = Math.min(lines.length, TOOL_INPUT_MAX_ISSUES);
      let detail = render(count);
      while (detail.length > TOOL_INPUT_DETAIL_MAX && count > 1) {
        count--;
        detail = render(count);
      }
      return detail.length > TOOL_INPUT_DETAIL_MAX
        ? boundDetail(detail)
        : detail;
    } catch {
      // Not JSON — fall through to the bounded slice.
    }
  }
  return boundDetail(texts[0]);
}

/** The invariant tail every TOOL_INPUT_INVALID message ends with. */
const TOOL_INPUT_MESSAGE_TAIL =
  "The request was not executed and no provider call was made.";

/**
 * Compose the curated TOOL_INPUT_INVALID message: never blames the provider,
 * names the tool, and keeps the field-level validation diagnosis.
 */
function toolInputMessage(failure: ToolInputFailure): string {
  if (failure.kind === "no-such-tool") {
    const tool = failure.toolName ? `"${failure.toolName}"` : "an unknown tool";
    return `The model requested ${tool}, which does not exist. ${TOOL_INPUT_MESSAGE_TAIL}`;
  }
  const detail = validationDetail(failure.causeText);
  const tool = failure.toolName ?? "a tool";
  return detail
    ? `Invalid tool arguments for ${tool}: ${boundDetail(detail)}. ${TOOL_INPUT_MESSAGE_TAIL}`
    : `Invalid tool arguments for ${tool}. ${TOOL_INPUT_MESSAGE_TAIL}`;
}

/**
 * Classify a tool-request failure, or return null when the value is not one.
 * `candidates` are the retry-unwrapped records from the caller (see
 * lastUnderlyingError in providerErrors.ts); `rawText` is the caller's
 * flattened text form of the error.
 */
export function classifyToolInputError(
  error: unknown,
  candidates: Record<string, unknown>[],
  rawText: string,
): ToolInputClassification | null {
  const failure = classifyToolInputFailure(error, candidates, rawText);
  if (!failure) return null;
  return {
    message: toolInputMessage(failure),
    toolName: failure.toolName,
  };
}
