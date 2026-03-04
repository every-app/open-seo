import { createMiddleware } from "@tanstack/react-start";
import { asAppError, toClientError } from "@/server/lib/errors";

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

    if (appError?.code !== "UNAUTHENTICATED") {
      console.error("server.function error:", error);
    }

    throw toClientError(error);
  }
});
