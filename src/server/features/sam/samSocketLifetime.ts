import { isEveryAppAuthMode } from "@/lib/auth-mode";
import { getEnvValueSync } from "@/server/lib/runtime-env";

/**
 * How long a SAM WebSocket stays open behind an Every App gateway
 * (AUTH_MODE=everyapp). The Worker authorizes a socket once, when it
 * connects (src/server.ts), and OpenSEO's member rows mirror the gateway's
 * without ever being removed, so a member the gateway removes keeps an open
 * chat until it closes. Closing every socket this long after it connects
 * bounds that: the client reconnects through the gateway, which signs a
 * fresh identity, or refuses someone it no longer lets in. Conservative on
 * purpose (a reconnect is invisible unless a reply is streaming, which then
 * resumes), and no membership lookup per turn.
 */
export const SAM_EVERYAPP_SOCKET_LIFETIME_SECONDS = 15 * 60;

/** The close the client reconnects after: a normal one, not a terminal 4xxx. */
export const SAM_SOCKET_LIFETIME_CLOSE = {
  code: 1000,
  reason: "Reconnecting: chat sessions renew their sign-in every 15 minutes.",
} as const;

/**
 * On connect: schedule the socket's close this lifetime from now, behind an
 * Every App gateway only. The agent's schedule is a Durable Object alarm, so
 * the close outlives hibernation; it calls the agent's `closeExpiredSocket`.
 */
export async function scheduleSamSocketClose(
  env: object,
  agent: {
    schedule(
      delaySeconds: number,
      callback: "closeExpiredSocket",
      connectionId: string,
    ): Promise<unknown>;
  },
  connectionId: string,
): Promise<void> {
  if (!isEveryAppAuthMode(getEnvValueSync(env, "AUTH_MODE"))) return;
  await agent.schedule(
    SAM_EVERYAPP_SOCKET_LIFETIME_SECONDS,
    "closeExpiredSocket",
    connectionId,
  );
}

/** The scheduled close: a socket that has gone already needs nothing. */
export function closeSamSocket(
  connection: { close(code?: number, reason?: string): void } | undefined,
): void {
  if (!connection) return;
  try {
    connection.close(
      SAM_SOCKET_LIFETIME_CLOSE.code,
      SAM_SOCKET_LIFETIME_CLOSE.reason,
    );
  } catch (error) {
    // Already closing.
    console.warn("[sam] closing an expired socket failed", error);
  }
}
