import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { globalServerFunctionMiddleware } from "@/serverFunctions/middleware";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
  functionMiddleware: globalServerFunctionMiddleware,
}));
