import { AppError } from "@/server/lib/errors";

/**
 * The provider is configured but currently unavailable (e.g. credentials
 * missing, OAuth revoked, network down). The router should try the next
 * provider in the priority chain.
 */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly provider: string,
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? `Provider ${provider} is unavailable`);
    this.name = "ProviderUnavailableError";
  }
}

/**
 * The provider does not support the requested data type or parameters. The
 * router should try the next provider without treating this as a failure.
 */
export class ProviderUnsupportedError extends Error {
  constructor(
    public readonly provider: string,
    public readonly dataType: string,
    message?: string,
  ) {
    super(message ?? `Provider ${provider} does not support ${dataType}`);
    this.name = "ProviderUnsupportedError";
  }
}

/**
 * The DataForSEO budget guard has been exceeded. The router must NOT call
 * DataForSEO and should return a structured budget-exceeded result.
 */
export class BudgetExceededError extends Error {
  constructor(
    public readonly period: "daily" | "monthly",
    public readonly limit: number,
    public readonly spent: number,
  ) {
    super(
      `DataForSEO ${period} budget exceeded: ${spent.toFixed(4)} / ${limit.toFixed(4)} USD`,
    );
    this.name = "BudgetExceededError";
  }
}

/**
 * Provider authentication failed (invalid credentials, expired token). Maps
 * to existing DATAFORSEO_AUTH_FAILED / RATE_LIMITED error codes where
 * appropriate.
 */
export class AuthenticationError extends Error {
  constructor(
    public readonly provider: string,
    message?: string,
  ) {
    super(message ?? `Authentication failed for ${provider}`);
    this.name = "AuthenticationError";
  }
}

/**
 * Provider rate limit was hit. The router may retry or fall back.
 */
export class RateLimitError extends Error {
  constructor(
    public readonly provider: string,
    message?: string,
  ) {
    super(message ?? `Rate limit reached for ${provider}`);
    this.name = "RateLimitError";
  }
}

/**
 * Convert a provider error into an AppError with an appropriate code, so it
 * flows through the existing error-handling pipeline. Returns null when the
 * error is not a recognized provider error (caller should re-throw).
 */
export function toAppError(error: unknown): AppError | null {
  if (error instanceof BudgetExceededError) {
    return new AppError("PAYMENT_REQUIRED", error.message);
  }
  if (error instanceof AuthenticationError) {
    if (error.provider === "dataforseo") {
      return new AppError("DATAFORSEO_AUTH_FAILED", error.message);
    }
    return new AppError("UNAUTHENTICATED", error.message);
  }
  if (error instanceof RateLimitError) {
    return new AppError("RATE_LIMITED", error.message);
  }
  if (error instanceof ProviderUnavailableError) {
    return new AppError("UPSTREAM_UNAVAILABLE", error.message);
  }
  return null;
}