import { db } from "@/db";
import { user } from "@/db/schema";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { getOrCreateDefaultHostedOrganization } from "@/server/auth/default-hosted-organization";
import { AppError } from "@/server/lib/errors";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { eq } from "drizzle-orm";
import { z } from "zod";

// AgentOnboard (AO) is an identity layer for AI agents. An agent presents a
// short-lived session token in the `x-session-token` header; we exchange it
// once against AO's /api/verify and get back the user's AO login email. Email
// is the join key: we map it to the matching OpenSEO account and serve that
// account to the agent — with the same permissions the user's own MCP clients
// have. This file is the hosted-only core shared by the /mcp boundary. See the
// AgentOnboard Partner Guide for the verify contract and email join-key policy.

const AGENTONBOARD_API_URL = "https://api.ao.aawej.in";
const SESSION_TOKEN_HEADER = "x-session-token";

// The AO /api/verify response is untrusted cross-boundary data — narrow it
// with Zod at the trust boundary (same pattern as the OAuth MCP props schema).
// Success carries `email`; failure carries `error` — never both, so each field
// is optional and the caller branches on which is present.
const verifyResponseSchema = z
  .object({
    email: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

// Machine-readable classification of an AgentOnboard verification failure, so
// callers can distinguish "the agent's token is bad" from "our key is broken"
// without matching on upstream error strings.
type AgentVerifyFailureCode = "invalid_session" | "revoked_key" | "upstream";

type AgentVerifyResult =
  | { ok: true; email: string }
  | { ok: false; code: AgentVerifyFailureCode; error: string };

export function getSessionTokenHeader(): string {
  return SESSION_TOKEN_HEADER;
}

// The AgentOnboard path is live only when a partner key is configured AND the
// deployment is hosted. Hosted is the mode that owns the OAuth'd /mcp server,
// which is the surface agents target; cloudflare_access / local_noauth opt in
// later. Unset → the header is ignored and normal auth applies.
export async function isAgentOnboardConfigured(): Promise<boolean> {
  if (!isHostedAuthMode(await getOptionalEnvValue("AUTH_MODE"))) {
    return false;
  }
  return Boolean(await getOptionalEnvValue("AGENTONBOARD_PARTNER_KEY"));
}

// POST {apiUrl}/api/verify — the AgentOnboard partner contract. Returns the
// user's AO login email on success, or a machine code + reason on failure.
export async function verifySessionToken(
  sessionToken: string,
): Promise<AgentVerifyResult> {
  const partnerKey = await getRequiredEnvValue("AGENTONBOARD_PARTNER_KEY");

  let response: Response;
  try {
    response = await fetch(`${AGENTONBOARD_API_URL}/api/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${partnerKey}`,
      },
      body: JSON.stringify({ sessionToken }),
    });
  } catch (error) {
    // Network failure is our problem, not the agent's. The thrown value is
    // opaque; log it and return a stable classification.
    console.error("AgentOnboard verify request failed:", error);
    return {
      ok: false,
      code: "upstream",
      error: "Network error: cannot reach AgentOnboard",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      code: "upstream",
      error: `Invalid response from AgentOnboard (status ${response.status})`,
    };
  }

  const parsed = verifyResponseSchema.safeParse(body);
  if (response.ok && parsed.success && parsed.data.email) {
    return { ok: true, email: parsed.data.email };
  }

  // The contract: 401 = bad/expired session token (the agent's fault);
  // 403 = partner key revoked (our misconfig); 500 = AO server error.
  const upstreamError =
    parsed.success && parsed.data.error
      ? parsed.data.error
      : `AgentOnboard returned ${response.status}`;

  if (response.status === 403) {
    return { ok: false, code: "revoked_key", error: upstreamError };
  }

  if (response.status >= 500) {
    return { ok: false, code: "upstream", error: upstreamError };
  }

  return { ok: false, code: "invalid_session", error: upstreamError };
}

// The shared core: verify the agent's token, map the AO email to an OpenSEO
// account, and return the same EnsuredUserContext the rest of the app speaks.
// Returns null when the request is not an agent request (no session token).
export async function resolveAgentContext(
  headers: Headers,
): Promise<EnsuredUserContext | null> {
  if (!(await isAgentOnboardConfigured())) {
    return null;
  }

  const sessionToken = headers.get(SESSION_TOKEN_HEADER);
  if (!sessionToken) {
    return null;
  }

  const result = await verifySessionToken(sessionToken);
  if (!result.ok) {
    // A bad/expired session token is the agent's fault — unauthenticated.
    if (result.code === "invalid_session") {
      throw new AppError("UNAUTHENTICATED");
    }
    // A revoked partner key (or any AO-server/network failure) is a
    // server-side problem, not the agent's fault. Log it and fail closed.
    console.error(
      result.code === "revoked_key"
        ? "AgentOnboard partner key has been revoked — rotate it in the partner dashboard"
        : "AgentOnboard verify upstream failure:",
      result.error,
    );
    throw new AppError("UPSTREAM_UNAVAILABLE", result.error);
  }

  const agentEmail = result.email;
  const matchedUser = await db.query.user.findFirst({
    where: eq(user.email, agentEmail),
  });

  if (!matchedUser) {
    // Verify succeeded but there is no OpenSEO account under this email —
    // the docs' email-mismatch case. Tell the user how to fix it.
    throw new AppError(
      "UNAUTHENTICATED",
      "No account exists with this email. Create an OpenSEO account with the same email you use on AgentOnboard, then try again.",
    );
  }

  // An AO-verified email does not prove the OpenSEO email is verified. Fail
  // closed rather than let an unverified account act through an agent.
  if (!matchedUser.emailVerified) {
    throw new AppError(
      "UNAUTHENTICATED",
      "The email on this OpenSEO account is not verified. Verify it before using an agent.",
    );
  }

  // The agent acts as the user, so it runs in the user's own organization —
  // mirroring resolveHostedContext. There is no session to read an "active"
  // org from, so this resolves the user's first-existing membership, or their
  // default hosted org if none — exactly the hosted resolver's no-session
  // fallback.
  const organizationId = await getOrCreateDefaultHostedOrganization(
    matchedUser.id,
    (input) =>
      import("@/lib/auth").then(({ getAuth }) =>
        getAuth().api.createOrganization({ body: input }),
      ),
  );

  return {
    userId: matchedUser.id,
    userEmail: agentEmail,
    // The AO token proves this identity; the user's email is verified.
    emailVerified: true,
    organizationId,
  };
}
