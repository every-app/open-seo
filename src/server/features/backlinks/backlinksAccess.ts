import { z } from "zod";
import { getWorkersBinding } from "@/server/lib/runtime-env";

const BACKLINKS_ACCESS_STATUS_KEY = "settings:backlinks-access:v2:global";

const backlinksAccessStatusSchema = z.object({
  enabled: z.boolean(),
  verifiedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
});

type BacklinksAccessStatus = z.infer<typeof backlinksAccessStatusSchema>;

const BACKLINKS_NOT_ENABLED_MESSAGE =
  "Backlinks access check failed - it's still not enabled for your DataForSEO account. Enable it in DataForSEO, then try again.";

export async function getBacklinksAccessStatus(): Promise<BacklinksAccessStatus> {
  const kv = await getKvNamespace();
  const raw = await kv.get(BACKLINKS_ACCESS_STATUS_KEY, "text");
  if (!raw) {
    return getDefaultBacklinksAccessStatus();
  }

  const json = parseJsonUnknown(raw);
  if (json === null) {
    return getDefaultBacklinksAccessStatus();
  }

  const parsed = backlinksAccessStatusSchema.safeParse(json);
  if (!parsed.success) {
    return getDefaultBacklinksAccessStatus();
  }

  return parsed.data;
}

export async function setBacklinksAccessStatus(
  status: BacklinksAccessStatus,
): Promise<void> {
  const kv = await getKvNamespace();
  await kv.put(BACKLINKS_ACCESS_STATUS_KEY, JSON.stringify(status));
}

export function buildVerifiedBacklinksAccessStatus(
  checkedAt: string,
): BacklinksAccessStatus {
  return {
    enabled: true,
    verifiedAt: checkedAt,
    lastCheckedAt: checkedAt,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}

export function buildBacklinksDisabledAccessStatus(
  checkedAt: string,
  errorCode: string,
): BacklinksAccessStatus {
  return {
    enabled: false,
    verifiedAt: null,
    lastCheckedAt: checkedAt,
    lastErrorCode: errorCode,
    lastErrorMessage: BACKLINKS_NOT_ENABLED_MESSAGE,
  };
}

function getDefaultBacklinksAccessStatus(): BacklinksAccessStatus {
  return {
    enabled: false,
    verifiedAt: null,
    lastCheckedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}

async function getKvNamespace(): Promise<KVNamespace> {
  const binding = await getWorkersBinding("KV");
  if (isKvNamespace(binding)) {
    return binding;
  }

  throw new Error("KV binding is not configured correctly");
}

function isKvNamespace(value: unknown): value is KVNamespace {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    typeof value.get === "function" &&
    "put" in value &&
    typeof value.put === "function"
  );
}

function parseJsonUnknown(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
