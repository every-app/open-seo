import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";
import { getAuth } from "@/lib/auth";
import { AppError, asAppError, toClientError } from "@/server/lib/errors";
import { captureServerError } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

// This middleware wraps ensureUserMiddleware, so the resolved user context isn't
// in scope when a downstream handler throws. Re-read the session instead — but
// not via resolveHostedContext, which can create an organization as a side
// effect. disableRefresh keeps this a pure read: it runs inside waitUntil, where
// a refreshed Set-Cookie is discarded anyway. Any throw here would drop the whole
// exception report, so every failure degrades to an anonymous capture.
async function resolveErrorDistinctId(
  headers: Headers,
): Promise<string | undefined> {
  if (!(await isHostedServerAuthMode())) return undefined;
  try {
    const session = await getAuth().api.getSession({
      headers,
      query: { disableRefresh: true },
    });
    if (session?.user?.analyticsOptedOut === true) return undefined;
    return session?.user?.id;
  } catch {
    return undefined;
  }
}

// TanStack's serverFn validator throws a plain Error whose message is the
// JSON-serialized standard-schema issue list. Treat those as input validation,
// not server faults.
function isValidatorError(error: Error): boolean {
  if (!error.message.startsWith("[")) return false;
  try {
    const issues: unknown = JSON.parse(error.message);
    if (!Array.isArray(issues) || issues.length === 0) return false;
    return issues.every(
      (issue: unknown) =>
        typeof issue === "object" &&
        issue !== null &&
        "message" in issue &&
        typeof issue.message === "string",
    );
  } catch {
    return false;
  }
}

export const errorHandlingMiddleware = createMiddleware({
  type: "function",
}).server(async (c) => {
  const { next } = c;

  try {
    return await next();
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new Error("INTERNAL_ERROR", { cause: error });
    }

    const appError = isValidatorError(error)
      ? new AppError("VALIDATION_ERROR")
      : asAppError(error);

    if (shouldCaptureAppErrorCode(appError?.code)) {
      const request = getRequest();
      const url = new URL(request.url);

      console.error("server.function error:", error);
      const properties = {
        errorCode: appError?.code ?? "INTERNAL_ERROR",
        method: request.method,
        path: url.pathname,
        ...appError?.details,
      };
      waitUntil(
        resolveErrorDistinctId(request.headers).then((distinctId) =>
          captureServerError(error, properties, distinctId),
        ),
      );
    }

    throw toClientError(appError ?? error);
  }
});
