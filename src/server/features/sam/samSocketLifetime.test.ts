import { describe, expect, it, vi } from "vitest";
import {
  SAM_EVERYAPP_SOCKET_LIFETIME_SECONDS,
  SAM_SOCKET_LIFETIME_CLOSE,
  scheduleSamSocketClose,
  closeSamSocket,
} from "./samSocketLifetime";

describe("SAM's socket lifetime behind an Every App gateway", () => {
  it("schedules each socket's close 15 minutes after it connects", async () => {
    const schedule = vi.fn(async () => undefined);
    await scheduleSamSocketClose({ AUTH_MODE: "everyapp" }, { schedule }, "c1");
    expect(schedule).toHaveBeenCalledWith(
      SAM_EVERYAPP_SOCKET_LIFETIME_SECONDS,
      "closeExpiredSocket",
      "c1",
    );
    expect(SAM_EVERYAPP_SOCKET_LIFETIME_SECONDS).toBe(900);
  });

  it("leaves sockets open in every other mode", async () => {
    const schedule = vi.fn(async () => undefined);
    for (const env of [
      { AUTH_MODE: "hosted" },
      { AUTH_MODE: "cloudflare_access" },
      { AUTH_MODE: "local_noauth" },
      {},
    ]) {
      await scheduleSamSocketClose(env, { schedule }, "c1");
    }
    expect(schedule).not.toHaveBeenCalled();
  });

  it("closes with a code the client reconnects after, through the gateway", () => {
    const close = vi.fn();
    closeSamSocket({ close });
    expect(close).toHaveBeenCalledWith(1000, SAM_SOCKET_LIFETIME_CLOSE.reason);
    // The agents client stops retrying on 1008 and 4000-4999.
    expect(SAM_SOCKET_LIFETIME_CLOSE.code).toBe(1000);
  });

  it("does nothing for a socket that has gone, or is closing", () => {
    expect(() => closeSamSocket(undefined)).not.toThrow();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      closeSamSocket({
        close: () => {
          throw new Error("closed");
        },
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
