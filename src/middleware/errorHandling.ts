import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { asAppError, toClientError } from "@/server/lib/errors";
import { captureServerError } from "@/server/lib/posthog";

function shouldCaptureServerError(code: string | null | undefined) {
  return (
    code !== "UNAUTHENTICATED" &&
    code !== "NOT_FOUND" &&
    code !== "VALIDATION_ERROR"
  );
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

    const appError = asAppError(error);

    if (shouldCaptureServerError(appError?.code)) {
      const request = getRequest();
      const url = new URL(request.url);

      console.error("server.function error:", error);
      waitUntil(
        captureServerError(error, {
          errorCode: appError?.code ?? "INTERNAL_ERROR",
          method: request.method,
          path: url.pathname,
        }),
      );
    }

    throw toClientError(error);
  }
});
