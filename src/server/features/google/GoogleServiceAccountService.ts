import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { getAuthMode } from "@/lib/auth-mode";
import { GoogleServiceAccountRepository } from "@/server/features/google/GoogleServiceAccountRepository";
import {
  fetchServiceAccountAccessToken,
  importServiceAccountKey,
  serviceAccountKeyFileSchema,
} from "@/server/features/google/googleServiceAccountToken";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { GSC_DATA_SCOPE } from "@/shared/gsc";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

/**
 * Search Console access through an uploaded Google service account key, as an
 * alternative to a member's OAuth grant. Self-hosting only: the operator opts
 * in by setting GOOGLE_SERVICE_ACCOUNT_SECRET, which encrypts the keys at
 * rest. Hosted and gateway deployments never offer it.
 *
 * A key belongs to the organization, not to the member who uploaded it. The
 * private key never leaves the server, in responses, errors or logs; the
 * client sees only the account's email.
 */

// Refresh a cached token when it is this close to expiry.
const TOKEN_SKEW_MS = 60_000;

// Access tokens per service account id, per isolate. A token lives an hour,
// so caching avoids a signing round trip on every Search Console call.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function readEncryptionKey(): Promise<string | null> {
  const secret = (
    await getOptionalEnvValue("GOOGLE_SERVICE_ACCOUNT_SECRET")
  )?.trim();
  return secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH
    ? secret
    : null;
}

async function getEncryptionKey(): Promise<string> {
  const secret = await readEncryptionKey();
  if (!secret) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Set GOOGLE_SERVICE_ACCOUNT_SECRET to at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters to use service account keys. It encrypts them.`,
    );
  }
  return secret;
}

/** Whether this deployment offers service account keys. */
async function isEnabled(): Promise<boolean> {
  const mode = getAuthMode(await getOptionalEnvValue("AUTH_MODE"));
  if (mode === "hosted" || mode === "everyapp") return false;
  return (await readEncryptionKey()) !== null;
}

async function requireEnabled(): Promise<string> {
  if (!(await isEnabled())) {
    throw new AppError(
      "FORBIDDEN",
      "Service account keys aren't enabled on this OpenSEO deployment.",
    );
  }
  return getEncryptionKey();
}

async function listForOrganization(organizationId: string) {
  if (!(await isEnabled())) return [];
  return GoogleServiceAccountRepository.listForOrganization(organizationId);
}

/** The organization's keys with how many projects each one connects. */
async function listSummaries(organizationId: string) {
  const rows = await listForOrganization(organizationId);
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      projectCount: await GoogleServiceAccountRepository.countConnections({
        organizationId,
        id: row.id,
      }),
    })),
  );
}

function parseKeyFile(keyJson: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(keyJson);
  } catch {
    throw new AppError("VALIDATION_ERROR", "That isn't a JSON key file.");
  }
  const parsed = serviceAccountKeyFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "That file isn't a Google service account key. Create a JSON key under IAM & Admin → Service accounts → Keys.",
    );
  }
  return parsed.data;
}

/**
 * Validates a key file, proves Google accepts it, and stores it encrypted.
 * Uploading a new key for an account the organization already has replaces
 * the old one.
 */
async function add(input: {
  organizationId: string;
  userId: string;
  keyJson: string;
}) {
  const secret = await requireEnabled();
  const keyFile = parseKeyFile(input.keyJson);

  let privateKey: CryptoKey;
  try {
    privateKey = await importServiceAccountKey(keyFile.private_key);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "The private key in that file couldn't be read.",
    );
  }
  const token = await fetchServiceAccountAccessToken({
    clientEmail: keyFile.client_email,
    privateKey,
    scope: GSC_DATA_SCOPE,
  });
  if (!token) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Google rejected this key. It may have been deleted or disabled in Google Cloud.",
    );
  }

  const row = await GoogleServiceAccountRepository.upsert({
    organizationId: input.organizationId,
    clientEmail: keyFile.client_email,
    privateKeyId: keyFile.private_key_id ?? null,
    encryptedPrivateKey: await symmetricEncrypt({
      key: secret,
      data: keyFile.private_key,
    }),
    createdByUserId: input.userId,
  });
  tokenCache.delete(row.id);
  return row;
}

/** Deletes a key and the project connections that used it. Returns those
 *  projects so the caller can clear what it cached for them. */
async function remove(input: { organizationId: string; id: string }) {
  const row = await GoogleServiceAccountRepository.getForOrganization(input);
  if (!row) throw new AppError("NOT_FOUND", "That service account is gone.");
  const projectIds =
    await GoogleServiceAccountRepository.listConnectedProjectIds(input);
  await GoogleServiceAccountRepository.remove(input);
  tokenCache.delete(input.id);
  return projectIds;
}

/** A Search Console access token for a stored service account. */
async function getSearchConsoleAccessToken(id: string): Promise<string> {
  const cached = tokenCache.get(id);
  if (cached && cached.expiresAt - Date.now() > TOKEN_SKEW_MS) {
    return cached.token;
  }
  const row = await GoogleServiceAccountRepository.getById(id);
  if (!row) throw new Error("The service account key was removed.");
  const privateKey = await importServiceAccountKey(
    await symmetricDecrypt({
      key: await getEncryptionKey(),
      data: row.encryptedPrivateKey,
    }),
  );
  const token = await fetchServiceAccountAccessToken({
    clientEmail: row.clientEmail,
    privateKey,
    scope: GSC_DATA_SCOPE,
  });
  if (!token) throw new Error("Google refused the service account key.");
  tokenCache.set(id, {
    token: token.accessToken,
    expiresAt: Date.now() + token.expiresInSeconds * 1_000,
  });
  return token.accessToken;
}

export const GoogleServiceAccountService = {
  isEnabled,
  listForOrganization,
  listSummaries,
  add,
  remove,
  getSearchConsoleAccessToken,
};
