import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { z } from "zod";
import {
  UmamiRepository,
  type UmamiConnection,
  type UmamiInstance,
} from "@/server/features/umami/repositories/UmamiRepository";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  createUmamiClient,
  type UmamiClient,
  type UmamiWebsite,
} from "@/server/lib/umamiClient";
import { UmamiError } from "@/server/lib/umamiErrors";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";
import {
  normalizeUmamiBaseUrl,
  umamiHeaderSchema,
  type UmamiAuthType,
  type UmamiHeader,
} from "@/shared/umami";

const DAY_MILLISECONDS = 86_400_000;

// The same secret that encrypts the Google OAuth tokens. Every deployment
// mode that stores integration credentials already sets it.
async function getEncryptionKey(): Promise<string | null> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH
    ? secret
    : null;
}

async function requireEncryptionKey(): Promise<string> {
  const key = await getEncryptionKey();
  if (!key) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Set BETTER_AUTH_SECRET to at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters to store Umami credentials. It encrypts them.`,
    );
  }
  return key;
}

async function isEncryptionConfigured(): Promise<boolean> {
  return (await getEncryptionKey()) !== null;
}

/** What the client may see about a saved Umami login: never the secret or
 *  the header values. */
type UmamiInstanceSummary = {
  id: string;
  baseUrl: string;
  authType: UmamiAuthType;
  username: string | null;
  hasCustomHeaders: boolean;
  createdAt: string;
};

function toInstanceSummary(instance: UmamiInstance): UmamiInstanceSummary {
  return {
    id: instance.id,
    baseUrl: instance.baseUrl,
    authType: instance.authType,
    username: instance.username,
    hasCustomHeaders: instance.encryptedHeaders !== null,
    createdAt: instance.createdAt,
  };
}

/** Decrypts in memory only. The result must never be persisted or logged. */
async function openInstance(instance: UmamiInstance): Promise<UmamiClient> {
  const key = await requireEncryptionKey();
  let secret: string;
  let headers: UmamiHeader[] = [];
  try {
    secret = await symmetricDecrypt({ key, data: instance.encryptedSecret });
    if (instance.encryptedHeaders) {
      headers = z
        .array(umamiHeaderSchema)
        .parse(
          JSON.parse(
            await symmetricDecrypt({ key, data: instance.encryptedHeaders }),
          ),
        );
    }
  } catch {
    // A rotated BETTER_AUTH_SECRET makes the stored credentials unreadable.
    throw new UmamiError(
      "umami_auth_failed",
      "The saved Umami credentials can no longer be read. Add the Umami login again.",
    );
  }
  return createUmamiClient({
    baseUrl: instance.baseUrl,
    authType: instance.authType,
    username: instance.username,
    secret,
    headers,
  });
}

type Problem = { problem: { code: UmamiError["code"]; message: string } };

function asProblem(error: unknown): Problem {
  if (error instanceof UmamiError) {
    return { problem: { code: error.code, message: error.message } };
  }
  throw error;
}

async function listInstances(
  organizationId: string,
): Promise<UmamiInstanceSummary[]> {
  const rows = await UmamiRepository.listInstances(organizationId);
  return rows.map(toInstanceSummary);
}

/**
 * Checks the login against the server (listing its websites proves the URL,
 * credentials, and proxy headers all work) before anything is stored. A
 * failure comes back as a problem to show next to the form.
 */
async function saveInstance(input: {
  organizationId: string;
  userId: string;
  baseUrl: string;
  authType: UmamiAuthType;
  username: string | null;
  secret: string;
  headers: UmamiHeader[];
}): Promise<
  { instance: UmamiInstanceSummary; websites: UmamiWebsite[] } | Problem
> {
  const key = await requireEncryptionKey();
  const baseUrl = normalizeUmamiBaseUrl(input.baseUrl);
  if (!baseUrl) {
    return {
      problem: {
        code: "validation_error",
        message: "Enter the Umami URL, like https://analytics.example.com.",
      },
    };
  }
  const username = input.authType === "password" ? input.username : null;

  let websites: UmamiWebsite[];
  try {
    websites = await createUmamiClient({
      baseUrl,
      authType: input.authType,
      username,
      secret: input.secret,
      headers: input.headers,
    }).listWebsites();
  } catch (error) {
    return asProblem(error);
  }

  const encryptedSecret = await symmetricEncrypt({ key, data: input.secret });
  const encryptedHeaders =
    input.headers.length > 0
      ? await symmetricEncrypt({ key, data: JSON.stringify(input.headers) })
      : null;

  const existing = await UmamiRepository.findMatchingInstance({
    organizationId: input.organizationId,
    baseUrl,
    authType: input.authType,
    username,
  });
  const instance =
    (existing &&
      (await UmamiRepository.updateInstanceCredentials({
        organizationId: input.organizationId,
        instanceId: existing.id,
        encryptedSecret,
        encryptedHeaders,
        savedByUserId: input.userId,
      }))) ??
    (await UmamiRepository.insertInstance({
      organizationId: input.organizationId,
      baseUrl,
      authType: input.authType,
      username,
      encryptedSecret,
      encryptedHeaders,
      savedByUserId: input.userId,
    }));
  return { instance: toInstanceSummary(instance), websites };
}

async function requireInstance(organizationId: string, instanceId: string) {
  const instance = await UmamiRepository.getInstance(
    organizationId,
    instanceId,
  );
  if (!instance) {
    throw new AppError("NOT_FOUND", "That Umami login isn't saved here.");
  }
  return instance;
}

async function listWebsites(input: {
  organizationId: string;
  instanceId: string;
}): Promise<{ websites: UmamiWebsite[] } | Problem> {
  const instance = await requireInstance(
    input.organizationId,
    input.instanceId,
  );
  try {
    const client = await openInstance(instance);
    return { websites: await client.listWebsites() };
  } catch (error) {
    return asProblem(error);
  }
}

/**
 * Binds a project to one website. Reading the website and a one-day stats
 * window confirms the login can see it and that the server runs a supported
 * Umami version, so a broken pick fails here instead of on the dashboard.
 */
async function setWebsite(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  instanceId: string;
  websiteId: string;
  timeZone: string;
}): Promise<{ connection: UmamiConnection } | Problem> {
  const instance = await requireInstance(
    input.organizationId,
    input.instanceId,
  );
  let website: UmamiWebsite;
  try {
    const client = await openInstance(instance);
    website = await client.getWebsite(input.websiteId);
    const now = Date.now();
    await client.getStats(input.websiteId, {
      startAt: now - DAY_MILLISECONDS,
      endAt: now,
    });
  } catch (error) {
    return asProblem(error);
  }
  const connection = await UmamiRepository.upsertConnection({
    projectId: input.projectId,
    organizationId: input.organizationId,
    instanceId: instance.id,
    websiteId: website.id,
    websiteName: website.name || website.domain || website.id,
    websiteDomain: website.domain ?? null,
    timeZone: input.timeZone,
    connectedByUserId: input.userId,
  });
  return { connection };
}

async function getConnection(projectId: string) {
  return UmamiRepository.getConnectionWithInstance(projectId);
}

/** The project's connection plus a ready client, for reports. */
async function openConnection(projectId: string) {
  const row = await UmamiRepository.getConnectionWithInstance(projectId);
  if (!row) {
    throw new UmamiError(
      "umami_not_connected",
      "Umami is not connected for this project.",
    );
  }
  return {
    connection: row.connection,
    instance: row.instance,
    client: await openInstance(row.instance),
  };
}

async function disconnect(projectId: string): Promise<void> {
  await UmamiRepository.deleteConnection(projectId);
}

async function deleteInstance(input: {
  organizationId: string;
  instanceId: string;
}): Promise<void> {
  await UmamiRepository.deleteInstance(input.organizationId, input.instanceId);
}

export const UmamiService = {
  isEncryptionConfigured,
  listInstances,
  saveInstance,
  listWebsites,
  setWebsite,
  getConnection,
  openConnection,
  disconnect,
  deleteInstance,
};
