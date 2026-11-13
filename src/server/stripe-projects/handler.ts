import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { captureServerError } from "@/server/lib/posthog";
import { verifyStripeSignature } from "./signature";
import {
  API_SERVICE_ID,
  StripeProjectsError,
  authenticateBearer,
  createLoginLink,
  exchangeCode,
  getMcpUrl,
  linkAccount,
  provisionResource,
  refreshTokens,
  removeResource,
  requireResource,
  rotateResourceCredentials,
} from "./service";

// Stripe Projects provider endpoints (Agentic Provisioning Protocol 0.1d).
// The Stripe App manifest (deploy/stripe-app/stripe-app.json) points Stripe at
// `<origin>/api/stripe-projects/`; Stripe appends `provisioning/<name>` and
// calls the token endpoint at `oauth/token`. Hosted only, and off until the
// signing secret is set.
export const STRIPE_PROJECTS_PATH_PREFIX = "/api/stripe-projects/";
const API_VERSION = "0.1d";

const SERVICES = [
  {
    id: API_SERVICE_ID,
    description:
      "OpenSEO MCP server and API key for SEO research: keyword data, SERPs, backlinks, rank tracking, site audits and AI visibility. New accounts start with free credits. Paid plans and credit top-ups are billed by OpenSEO at https://openseo.so/pricing.",
    categories: ["search", "analytics", "ai"],
    pricing: { type: "free" },
    kind: "deployable",
  },
];

// The protocol treats null, a blank string and a missing field the same.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    schema.optional(),
  );

const accountRequestSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: optional(z.string()),
  expires_at: optional(z.string()),
  kyc: optional(z.object({ verified_fields: optional(z.array(z.string())) })),
  orchestrator: z.object({
    stripe: z.object({ account: z.string().min(1) }),
  }),
  code_challenge: optional(z.string().regex(/^[A-Za-z0-9_-]{43,128}$/)),
  code_challenge_method: optional(z.literal("S256")),
});

const resourceCreateSchema = z.object({ service_id: z.string().min(1) });

const deepLinkSchema = z.object({
  purpose: optional(z.string()),
  path: optional(z.string()),
});

// The protocol uses a different error shape per endpoint family.
type Envelope = "flat" | "typed" | "status" | "oauth";

export async function handleStripeProjectsRequest(request: Request) {
  const secret = await getOptionalEnvValue("STRIPE_PROJECTS_SIGNING_SECRET");
  if (!secret) return new Response("Not found", { status: 404 });

  const path = new URL(request.url).pathname.slice(
    STRIPE_PROJECTS_PATH_PREFIX.length,
  );
  const body = request.method === "GET" ? "" : await request.text();
  const signed = await verifyStripeSignature({
    header: request.headers.get("stripe-signature"),
    payload: body,
    secret,
  });
  const resourceId = /^provisioning\/resources\/([^/]+)/.exec(path)?.[1] ?? "";
  const route = `${request.method} ${resourceId ? path.replace(resourceId, ":id") : path}`;

  // The token endpoint accepts a PKCE verifier in place of the signature.
  if (route === "POST oauth/token") {
    return respond("oauth", "", () => handleToken(body, signed));
  }
  if (!signed) {
    return errorResponse("flat", "", {
      code: "invalid_signature",
      message: "Signature verification failed",
      status: 401,
    });
  }
  if (request.headers.get("api-version") !== API_VERSION) {
    return errorResponse("flat", "", {
      code: "invalid_api_version",
      message: `Supported API-Versions: ${API_VERSION}`,
      status: 400,
    });
  }

  switch (route) {
    case "GET provisioning/health":
      return Response.json({ status: "ok", supported_versions: [API_VERSION] });
    case "GET provisioning/services":
      return Response.json({ data: SERVICES });
    case "POST provisioning/account_requests":
      return respond("typed", readRequestId(body), () =>
        handleAccountRequest(body),
      );
  }

  return respond("status", resourceId, async () => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(
      request.headers.get("authorization") ?? "",
    )?.[1];
    const scope = bearer ? await authenticateBearer(bearer) : null;
    if (!scope) {
      throw new StripeProjectsError(
        "unauthorized",
        "Invalid or expired access token",
        401,
      );
    }

    switch (route) {
      case "POST provisioning/resources": {
        const input = parseJson(resourceCreateSchema, body);
        const created = await provisionResource(scope, input.service_id);
        return completeResponse(created.id, created.apiKey);
      }
      case "GET provisioning/resources/:id":
        // The key is only returned when it is minted (create and rotate);
        // Stripe keeps it in its vault.
        await requireResource(scope, resourceId);
        return completeResponse(resourceId);
      case "POST provisioning/resources/:id/rotate_credentials": {
        const rotated = await rotateResourceCredentials(scope, resourceId);
        return completeResponse(rotated.id, rotated.apiKey);
      }
      case "POST provisioning/resources/:id/remove":
        await removeResource(scope, resourceId);
        return Response.json({ status: "removed", id: resourceId });
      case "POST provisioning/deep_links": {
        const input = parseJson(deepLinkSchema, body);
        const link = await createLoginLink(scope, input.path);
        return Response.json({
          purpose: input.purpose ?? "dashboard",
          url: link.url,
          expires_at: link.expiresAt,
        });
      }
      default:
        throw new StripeProjectsError("not_found", "Unknown endpoint", 404);
    }
  });
}

async function handleAccountRequest(body: string) {
  const input = parseJson(accountRequestSchema, body);
  if (input.expires_at) {
    const expiresAt = Date.parse(
      // A timestamp without an offset is UTC.
      /[zZ]|[+-]\d\d:?\d\d$/.test(input.expires_at)
        ? input.expires_at
        : `${input.expires_at}Z`,
    );
    if (Number.isNaN(expiresAt)) {
      throw new StripeProjectsError(
        "invalid_request",
        "expires_at must be a valid ISO 8601 timestamp",
      );
    }
    if (expiresAt <= Date.now()) {
      throw new StripeProjectsError("expired", "Account request has expired");
    }
  }

  const { code } = await linkAccount({
    email: input.email,
    name: input.name,
    // Stripe lists what it checked in kyc.verified_fields. Without "email"
    // there, or with no kyc block at all, the request is refused.
    emailVerified: input.kyc?.verified_fields?.includes("email") ?? false,
    stripeAccountId: input.orchestrator.stripe.account,
    codeChallenge: input.code_challenge,
  });
  return Response.json({ id: input.id, type: "oauth", oauth: { code } });
}

async function handleToken(body: string, signed: boolean) {
  const form = new URLSearchParams(body);
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const code = form.get("code");
    if (!code) {
      throw new StripeProjectsError("invalid_request", "code is required");
    }
    return Response.json(
      await exchangeCode({
        code,
        codeVerifier: form.get("code_verifier") ?? undefined,
        signed,
      }),
    );
  }
  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) {
      throw new StripeProjectsError(
        "invalid_request",
        "refresh_token is required",
      );
    }
    return Response.json(await refreshTokens(refreshToken));
  }
  throw new StripeProjectsError(
    "unsupported_grant_type",
    "grant_type must be authorization_code or refresh_token",
  );
}

function completeResponse(id: string, key?: string) {
  return Response.json({
    status: "complete",
    id,
    service_id: API_SERVICE_ID,
    complete: {
      access_configuration: { ...(key ? { key } : {}), mcp_url: getMcpUrl() },
    },
  });
}

function parseJson<T>(schema: z.ZodType<T>, body: string): T {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new StripeProjectsError("invalid_request", "Body must be JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new StripeProjectsError(
      "invalid_request",
      issue
        ? `${issue.path.join(".") || "body"}: ${issue.message}`
        : "Invalid request",
    );
  }
  return parsed.data;
}

// Errors on an account request echo its id, even when the rest is invalid.
function readRequestId(body: string) {
  try {
    return z.object({ id: z.string() }).parse(JSON.parse(body)).id;
  } catch {
    return "";
  }
}

async function respond(
  envelope: Envelope,
  id: string,
  run: () => Promise<Response>,
) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StripeProjectsError) {
      return errorResponse(envelope, id, error);
    }
    console.error("stripe-projects request failed", error);
    await captureServerError(error, { source: "stripe-projects" });
    return errorResponse(envelope, id, {
      code: "server_error",
      message: "Internal error",
      status: 500,
    });
  }
}

function errorResponse(
  envelope: Envelope,
  id: string,
  { code, message, status }: { code: string; message: string; status: number },
) {
  const error = { code, message };
  const body =
    envelope === "oauth"
      ? { error: code, error_description: message }
      : envelope === "typed"
        ? { ...(id ? { id } : {}), type: "error", error }
        : envelope === "status"
          ? { status: "error", id, error }
          : { error };
  return Response.json(body, { status });
}
