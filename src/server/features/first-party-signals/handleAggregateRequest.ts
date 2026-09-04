import { env } from "cloudflare:workers";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  FIRST_PARTY_MAX_BODY_BYTES,
  firstPartyAggregateSnapshotSchema,
} from "@/shared/first-party-signals";
import { FirstPartyCredentialVault } from "./FirstPartyCredentialVault";
import {
  FirstPartyBatchConflictError,
  FirstPartySignalsService,
} from "./FirstPartySignalsService";
import { FirstPartySignalsRepository } from "./FirstPartySignalsRepository";
import {
  parseSignatureTimestamp,
  verifyFirstPartySignature,
} from "./FirstPartySignature";
import { sha256Hex } from "./encoding";
import { BodyLimitExceededError, readBodyCapped } from "./readBodyCapped";

const sourceIdSchema = z.string().uuid();

function json(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function safeError(error: unknown): Response {
  if (error instanceof FirstPartyBatchConflictError) {
    return json(409, { ok: false, error: "BATCH_CONFLICT" });
  }
  if (error instanceof AppError) {
    const status = error.code === "NOT_FOUND" ? 404 : 400;
    return json(status, { ok: false, error: error.code });
  }
  console.error("first_party_aggregate_ingest_failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return json(500, { ok: false, error: "INTERNAL_ERROR" });
}

export async function handleFirstPartyAggregateRequest(
  request: Request,
): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }
    const mediaType = request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      return json(415, { ok: false, error: "UNSUPPORTED_MEDIA_TYPE" });
    }
    const declaredLength = request.headers.get("Content-Length");
    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) > FIRST_PARTY_MAX_BODY_BYTES)
    ) {
      return json(413, { ok: false, error: "PAYLOAD_TOO_LARGE" });
    }
    const sourceIdResult = sourceIdSchema.safeParse(
      request.headers.get("X-OpenSEO-Source"),
    );
    const timestamp = parseSignatureTimestamp(
      request.headers.get("X-OpenSEO-Timestamp"),
    );
    if (!sourceIdResult.success || !timestamp) {
      return json(401, { ok: false, error: "INVALID_SIGNATURE" });
    }

    let rawBody: Uint8Array;
    try {
      rawBody = await readBodyCapped(request.body, FIRST_PARTY_MAX_BODY_BYTES);
    } catch (error) {
      if (!(error instanceof BodyLimitExceededError)) throw error;
      return json(413, { ok: false, error: "PAYLOAD_TOO_LARGE" });
    }

    const source = await FirstPartySignalsRepository.getActiveSourceForIngest(
      sourceIdResult.data,
    );
    if (!source?.encryptedSecret) {
      return json(401, { ok: false, error: "INVALID_SIGNATURE" });
    }
    let secret: string;
    try {
      secret = await FirstPartyCredentialVault.decrypt(source.encryptedSecret);
    } catch {
      return json(503, {
        ok: false,
        error: "CREDENTIAL_VAULT_UNAVAILABLE",
      });
    }
    if (
      !(await verifyFirstPartySignature({
        secret,
        timestamp,
        rawBody,
        signature: request.headers.get("X-OpenSEO-Signature"),
      }))
    ) {
      return json(401, { ok: false, error: "INVALID_SIGNATURE" });
    }
    // The binding exists on hosted deployments. Local and self-hosted
    // surfaces remain storage-bounded by one immutable batch per source/day.
    const rateLimit = env.FIRST_PARTY_INGEST_RATE_LIMIT;
    if (rateLimit) {
      const { success } = await rateLimit.limit({ key: source.id });
      if (!success) {
        return json(
          429,
          { ok: false, error: "RATE_LIMITED" },
          { "Retry-After": "60" },
        );
      }
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
      ) as unknown;
    } catch {
      return json(400, { ok: false, error: "INVALID_JSON" });
    }
    const parsed = firstPartyAggregateSnapshotSchema.safeParse(decoded);
    if (!parsed.success) {
      return json(400, {
        ok: false,
        error: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const result = await FirstPartySignalsService.saveSnapshot({
      source,
      snapshot: parsed.data,
      payloadDigest: await sha256Hex(rawBody),
    });
    return json(result.duplicate ? 200 : 202, { ok: true, ...result });
  } catch (error) {
    return safeError(error);
  }
}
