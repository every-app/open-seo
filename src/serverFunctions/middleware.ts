import { errorHandlingMiddleware } from "@/middleware/errorHandling";
import { ensureUserMiddleware } from "@/middleware/ensureUser";

export const authenticatedServerFunctionMiddleware = [
  errorHandlingMiddleware,
  ensureUserMiddleware,
] as const;
