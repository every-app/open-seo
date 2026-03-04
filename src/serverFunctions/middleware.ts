import { useSessionTokenClientMiddleware } from "@every-app/sdk/tanstack";
import { errorHandlingMiddleware } from "@/middleware/errorHandling";
import { ensureUserMiddleware } from "@/middleware/ensureUser";

export const authenticatedServerFunctionMiddleware = [
  errorHandlingMiddleware,
  useSessionTokenClientMiddleware,
  ensureUserMiddleware,
] as const;
