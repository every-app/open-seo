export const SCHEDULED_RANK_CHECKS_PATH = "/api/internal/scheduled-rank-checks";

type SchedulerAuthEnv = Pick<Env, "RANK_CHECK_SCHEDULER_SECRET">;
type ScheduledRankChecksRunner = () => Promise<void>;

function jsonResponse(body: unknown, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function handleScheduledRankChecksRequest(
  request: Request,
  env: SchedulerAuthEnv,
  runScheduledRankChecks: ScheduledRankChecksRunner,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, status: "method_not_allowed" }, 405, {
      Allow: "POST",
    });
  }

  const secret = env.RANK_CHECK_SCHEDULER_SECRET;
  if (!secret) {
    return jsonResponse({ ok: false, status: "not_configured" }, 503);
  }

  const authorization = request.headers.get("Authorization");
  const expectedAuthorization = `Bearer ${secret}`;
  if (
    !authorization ||
    !(await constantTimeEqual(authorization, expectedAuthorization))
  ) {
    return jsonResponse({ ok: false, status: "unauthorized" }, 401);
  }

  try {
    await runScheduledRankChecks();
    return jsonResponse({ ok: true, status: "completed" }, 200);
  } catch {
    console.error("[cron-http] Scheduled rank check invocation failed");
    return jsonResponse({ ok: false, status: "error" }, 500);
  }
}
