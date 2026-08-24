import { describe, expect, it, vi } from "vitest";
import {
  SCHEDULED_RANK_CHECKS_PATH,
  handleScheduledRankChecksRequest,
} from "./scheduledRankChecksHttp";

const url = `https://open-seo.example${SCHEDULED_RANK_CHECKS_PATH}`;

function request(method = "POST", authorization?: string) {
  return new Request(url, {
    method,
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

describe("handleScheduledRankChecksRequest", () => {
  it("fails closed when the scheduler secret is not configured", async () => {
    const run = vi.fn();

    const response = await handleScheduledRankChecksRequest(
      request("POST", "Bearer anything"),
      {},
      run,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      status: "not_configured",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["wrong", "Bearer wrong-secret"],
    ["wrong scheme", "Basic configured-secret"],
  ])("rejects %s authorization", async (_case, authorization) => {
    const run = vi.fn();

    const response = await handleScheduledRankChecksRequest(
      request("POST", authorization),
      { RANK_CHECK_SCHEDULER_SECRET: "configured-secret" },
      run,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      status: "unauthorized",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects non-POST requests without invoking the scheduler", async () => {
    const run = vi.fn();

    const response = await handleScheduledRankChecksRequest(
      request("GET", "Bearer configured-secret"),
      { RANK_CHECK_SCHEDULER_SECRET: "configured-secret" },
      run,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(await response.json()).toEqual({
      ok: false,
      status: "method_not_allowed",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("invokes the queued scheduled path and returns bounded counts", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const env = {
      RANK_CHECK_SCHEDULER_SECRET: "configured-secret",
    };

    const response = await handleScheduledRankChecksRequest(
      request("POST", "Bearer configured-secret"),
      env,
      run,
    );

    expect(run).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "completed",
    });
  });

  it("returns a generic error without exposing scheduler failures", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(new Error("database password leaked"));

    const response = await handleScheduledRankChecksRequest(
      request("POST", "Bearer configured-secret"),
      { RANK_CHECK_SCHEDULER_SECRET: "configured-secret" },
      run,
    );

    expect(response.status).toBe(500);
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({
      ok: false,
      status: "error",
    });
    expect(responseText).not.toContain("database password leaked");
  });
});
