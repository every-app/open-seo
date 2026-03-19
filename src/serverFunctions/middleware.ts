import { createMiddleware } from "@tanstack/react-start";
import { AppError } from "@/server/lib/errors";
import { errorHandlingMiddleware } from "@/middleware/errorHandling";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { ensureUserMiddleware } from "@/middleware/ensureUser";

type AuthenticatedServerFunctionContext = EnsuredUserContext;

function getAuthenticatedContext(
  context: unknown,
): AuthenticatedServerFunctionContext {
  if (!isAuthenticatedServerFunctionContext(context)) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Authenticated server function context missing",
    );
  }

  return context;
}

function isAuthenticatedServerFunctionContext(
  context: unknown,
): context is AuthenticatedServerFunctionContext {
  if (!context || typeof context !== "object") {
    return false;
  }

  return (
    "userId" in context &&
    typeof context.userId === "string" &&
    "userEmail" in context &&
    typeof context.userEmail === "string" &&
    "organizationId" in context &&
    typeof context.organizationId === "string"
  );
}

export const globalServerFunctionMiddleware = [
  errorHandlingMiddleware,
  ensureUserMiddleware,
] as const;

export const requireAuthenticatedContext = [
  createMiddleware({ type: "function" }).server(({ next, context }) =>
    next({
      context: getAuthenticatedContext(context),
    }),
  ),
] as const;

export const requireProjectContext = [
  createMiddleware({ type: "function" }).server(({ next, context }) => {
    const authenticatedContext = getAuthenticatedContext(context);

    if (!authenticatedContext.project) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Project context missing from authenticated server function",
      );
    }

    return next({
      context: {
        ...authenticatedContext,
        project: authenticatedContext.project,
      },
    });
  }),
] as const;
