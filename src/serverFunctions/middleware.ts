import { createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { errorHandlingMiddleware } from "@/middleware/errorHandling";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { ensureUserMiddleware } from "@/middleware/ensureUser";

const ensuredUserContextSchema: z.ZodType<EnsuredUserContext> = z.object({
  userId: z.string(),
  userEmail: z.string(),
  organizationId: z.string(),
  project: z.any().optional(),
});

function getAuthenticatedContext(context: unknown): EnsuredUserContext {
  const result = ensuredUserContextSchema.safeParse(context);
  if (!result.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Authenticated server function context missing",
    );
  }
  return result.data;
}

export const globalServerFunctionMiddleware = [
  errorHandlingMiddleware,
  ensureUserMiddleware,
] as const;

export const requireAuthenticatedContext = [
  createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const authenticatedContext = getAuthenticatedContext(context);

    return next({
      context: authenticatedContext,
    });
  }),
] as const;

export const requireProjectContext = [
  createMiddleware({ type: "function" }).server(async ({ next, context }) => {
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
        projectId: authenticatedContext.project.id,
      },
    });
  }),
] as const;
