import { z } from "zod";
import { GA4_OAUTH_PROVIDER_ID } from "./ga4";
import { GSC_OAUTH_PROVIDER_ID } from "./gsc";

export const GDPR_STORAGE_ERASURE_PATH = "/api/internal/gdpr-erasure/storage";

const MAX_ITEMS_PER_KIND = 10_000;
const boundedIds = z.array(z.string().min(1).max(512)).max(MAX_ITEMS_PER_KIND);

export const gdprStorageErasurePayloadSchema = z
  .object({
    userId: z.string().min(1).max(512),
    email: z.string().email().max(512),
    organizationIds: boundedIds,
    projectIds: boundedIds,
    samSessionIds: boundedIds,
    auditIds: boundedIds,
    activeAuditWorkflowIds: boundedIds,
    activeRankWorkflowIds: boundedIds,
    r2Keys: boundedIds,
    googleAccounts: z
      .array(
        z.object({
          providerId: z.enum([GSC_OAUTH_PROVIDER_ID, GA4_OAUTH_PROVIDER_ID]),
          accountId: z.string().min(1).max(512),
        }),
      )
      .max(MAX_ITEMS_PER_KIND),
  })
  .strict();

export type GdprStorageErasurePayload = z.infer<
  typeof gdprStorageErasurePayloadSchema
>;

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signGdprErasureRequest(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${timestamp}.${body}`),
    ),
  );
}
