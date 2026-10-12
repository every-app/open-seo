import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { CrawlerCredentialRepository } from "@/server/features/audit/repositories/CrawlerCredentialRepository";
import {
  checkShopifySignature,
  type ShopifySignatureProblem,
} from "@/server/features/audit/services/shopifySignature";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  isCrawlerAccessExpired,
  parseSignatureExpiry,
  shopifyCrawlerHeaders,
  type CrawlerAccess,
} from "@/shared/crawler-access";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

/**
 * A credential as it exists at rest: in the database and in the audit
 * workflow's persisted params. The signature values are ciphertext until
 * `openCrawlerAccess` decrypts them in memory for a crawl.
 */
export interface SealedCrawlerAccess {
  host: string;
  signatureInput: string;
  signature: string;
  expiresAt: string | null;
}

// Same key as the stored Google OAuth tokens, so self-hosters have one secret
// to set and hosted mode always has it.
async function getEncryptionKey(): Promise<string> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  if (!secret || secret.length < MIN_BETTER_AUTH_SECRET_LENGTH) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Set BETTER_AUTH_SECRET to at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters to store crawler access signatures. It encrypts them.`,
    );
  }
  return secret;
}

/**
 * What the client is allowed to see. The signature values are bot-protection
 * credentials: they never leave the server, in responses, errors, logs, or
 * analytics properties.
 */
interface CrawlerCredentialSummary {
  id: string;
  projectId: string;
  host: string;
  provider: "shopify";
  createdAt: string;
  expiresAt: string | null;
}

type CredentialRow = Awaited<
  ReturnType<typeof CrawlerCredentialRepository.listForOrganization>
>[number];

function toSummary(row: CredentialRow): CrawlerCredentialSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    host: row.host,
    provider: row.provider,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

async function listCrawlerCredentials(
  organizationId: string,
): Promise<CrawlerCredentialSummary[]> {
  const rows =
    await CrawlerCredentialRepository.listForOrganization(organizationId);
  return rows.map(toSummary);
}

/**
 * A signature Shopify would ignore on this host comes back as a problem to
 * show next to the form, instead of being stored and failing as 429s.
 */
async function saveCrawlerCredential(input: {
  organizationId: string;
  projectId: string;
  userId: string;
  host: string;
  signatureInput: string;
  signature: string;
}): Promise<
  | { credential: CrawlerCredentialSummary }
  | { problem: ShopifySignatureProblem }
> {
  const key = await getEncryptionKey();
  const problem = await checkShopifySignature({
    host: input.host,
    signatureInput: input.signatureInput,
    signature: input.signature,
  });
  if (problem) return { problem };

  await CrawlerCredentialRepository.upsert({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    host: input.host,
    provider: "shopify",
    signatureInput: await symmetricEncrypt({ key, data: input.signatureInput }),
    signature: await symmetricEncrypt({ key, data: input.signature }),
    expiresAt: parseSignatureExpiry(input.signatureInput),
    createdByUserId: input.userId,
  });

  const saved = (
    await CrawlerCredentialRepository.listForOrganization(input.organizationId)
  ).find((row) => row.projectId === input.projectId && row.host === input.host);
  if (!saved) throw new AppError("INTERNAL_ERROR");
  return { credential: toSummary(saved) };
}

async function deleteCrawlerCredential(input: {
  organizationId: string;
  id: string;
}) {
  await CrawlerCredentialRepository.remove(input.organizationId, input.id);
}

/**
 * The credential the audit crawler should replay for this host, if any. An
 * expired one is skipped: Shopify rejects it, and the report names the expiry.
 */
async function resolveCrawlerAccess(
  organizationId: string,
  projectId: string,
  host: string,
): Promise<{ id: string; sealed: SealedCrawlerAccess } | null> {
  const rows = await CrawlerCredentialRepository.findForOrganizationAndHost(
    organizationId,
    projectId,
    host,
  );
  const row = rows.find(
    (candidate) => !isCrawlerAccessExpired(candidate.expiresAt),
  );
  if (!row) return null;

  return {
    id: row.id,
    sealed: {
      host: row.host,
      signatureInput: row.signatureInput,
      signature: row.signature,
      expiresAt: row.expiresAt,
    },
  };
}

/** Decrypts in memory only. The result must never be persisted or logged. */
async function openCrawlerAccess(
  sealed: SealedCrawlerAccess | null | undefined,
): Promise<CrawlerAccess | null> {
  if (!sealed) return null;
  try {
    const key = await getEncryptionKey();
    return {
      host: sealed.host,
      expiresAt: sealed.expiresAt,
      headers: shopifyCrawlerHeaders(
        await symmetricDecrypt({ key, data: sealed.signatureInput }),
        await symmetricDecrypt({ key, data: sealed.signature }),
      ),
    };
  } catch {
    // A rotated BETTER_AUTH_SECRET makes stored signatures unreadable. Crawl
    // unsigned rather than fail the audit; the report asks for a new one.
    console.warn(`Could not decrypt crawler access for ${sealed.host}`);
    return null;
  }
}

export const CrawlerCredentialService = {
  listCrawlerCredentials,
  saveCrawlerCredential,
  deleteCrawlerCredential,
  resolveCrawlerAccess,
  openCrawlerAccess,
} as const;
