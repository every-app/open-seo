import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";
import { globalServerFunctionMiddleware } from "@/serverFunctions/middleware";
import { reloadForNewDeploy } from "@/client/lib/reloadForNewDeploy";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// A tab opened before a deploy can call a server function that deploy removed
// or renamed. TanStack throws for the unknown ID, and its request handler turns
// that into a 500 the tab can never recover from. Answer with this header
// instead so the client reloads onto the new build. This has to run as request
// middleware: by the time startHandler returns, the error is already a 500.
const STALE_CLIENT_HEADER = "x-openseo-stale-client";

const staleClientMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Server function info not found")
    ) {
      return new Response("This page is out of date. Reload to continue.", {
        status: 409,
        headers: { "Content-Type": "text/plain", [STALE_CLIENT_HEADER]: "1" },
      });
    }
    throw error;
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, staleClientMiddleware],
  functionMiddleware: globalServerFunctionMiddleware,
  serverFns: {
    // Client-side only.
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (response.headers.has(STALE_CLIENT_HEADER)) reloadForNewDeploy();
      return response;
    },
  },
}));
