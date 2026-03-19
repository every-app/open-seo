import { createStart } from "@tanstack/react-start";
import { globalServerFunctionMiddleware } from "@/serverFunctions/middleware";

export const startInstance = createStart(() => ({
  functionMiddleware: globalServerFunctionMiddleware,
}));
