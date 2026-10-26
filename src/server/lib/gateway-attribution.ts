import { AsyncLocalStorage } from "node:async_hooks";
import { IDENTITY_HEADER } from "@every-app/sdk/internal";
import type { EveryAppUser, GatewayCallFor } from "@every-app/sdk/server";
import { decodeJwt } from "jose";

// Whom OpenSEO's calls through an Every App gateway are for (AUTH_MODE=everyapp).
// The install is one organization's, so the gateway counts every call
// against it. While OpenSEO serves a request the gateway forwarded, the
// request's signed identity goes with the call (`for: request`) so the
// gateway also knows whose it was; work no request started (Workflows,
// SAM's turns, the cron) is the organization's background work.

interface ServedRequest {
  request: Request;
  /** When the forwarded identity expires (epoch ms). */
  expiresAt: number;
}

const servedRequests = new AsyncLocalStorage<ServedRequest>();

// A forwarded identity lives 120 seconds. One this close to its expiry could
// expire before the gateway checks it (a 401 the call can't recover from), so
// work still running then goes on as background work.
const IDENTITY_EXPIRY_MARGIN_MS = 15_000;

function identityExpiry(request: Request): number {
  const token = request.headers.get(IDENTITY_HEADER);
  if (!token) return 0;
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Serve `fn` for a request the gateway forwarded with `user`'s verified
 * identity: gateway calls made while it runs forward that identity. A request
 * with no user (a public route) forwards nothing.
 */
export function serveEveryAppRequest<T>(
  request: Request,
  user: EveryAppUser | null,
  fn: () => T,
): T {
  if (!user) return fn();
  return servedRequests.run(
    { request, expiresAt: identityExpiry(request) },
    fn,
  );
}

/**
 * The SDK's `for` for a gateway call made now: the served request while its
 * identity is good, else background work.
 */
export function gatewayCallFor(): GatewayCallFor {
  const served = servedRequests.getStore();
  if (served && Date.now() < served.expiresAt - IDENTITY_EXPIRY_MARGIN_MS) {
    return served.request;
  }
  return { background: true };
}
