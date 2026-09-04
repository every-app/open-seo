import { AppError } from "@/server/lib/errors";
import {
  INDEXNOW_CHUNK_SIZE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_OUTBOUND_BODY_BYTES,
  INDEXNOW_MAX_URLS,
  indexNowUrlsSchema,
  type IndexNowChunkReceipt,
} from "@/shared/indexnow";
import { IndexNowRepository } from "./IndexNowRepository";
import {
  assertPublicDns,
  type IndexNowFetcher,
  normalizeIndexNowUrls,
  projectOrigin,
  readTextCapped,
  validateKeyLocation,
} from "./IndexNowUrlPolicy";

function generatePublicKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function configure(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  keyLocation?: string;
}) {
  const domain = await IndexNowRepository.getProjectDomain(input.projectId);
  if (!domain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set the project domain before configuring IndexNow.",
    );
  }
  const origin = projectOrigin(domain);
  const publicKey = generatePublicKey();
  const keyLocation = validateKeyLocation(
    input.keyLocation ?? `${origin}/${publicKey}.txt`,
    origin,
  );
  const config = await IndexNowRepository.upsertConfig({
    projectId: input.projectId,
    organizationId: input.organizationId,
    publicKey,
    keyLocation,
    generatedByUserId: input.userId,
    now: new Date().toISOString(),
  });
  return {
    publicKey: config.publicKey,
    keyLocation: config.keyLocation,
    verified: false as const,
  };
}

async function getStatus(projectId: string) {
  const [config, submissions] = await Promise.all([
    IndexNowRepository.getConfig(projectId),
    IndexNowRepository.listRecentSubmissions(projectId),
  ]);
  return {
    configured: Boolean(config),
    publicKey: config?.publicKey ?? null,
    keyLocation: config?.keyLocation ?? null,
    keyVerifiedAt: config?.keyVerifiedAt ?? null,
    submissions,
  };
}

async function verifyKey(
  projectId: string,
  fetcher: IndexNowFetcher = fetch,
  dnsFetcher: IndexNowFetcher = fetch,
) {
  const config = await IndexNowRepository.getConfig(projectId);
  if (!config) {
    throw new AppError("NOT_FOUND", "IndexNow is not configured.");
  }
  const domain = await IndexNowRepository.getProjectDomain(projectId);
  if (!domain)
    throw new AppError("VALIDATION_ERROR", "Project domain missing.");
  const origin = projectOrigin(domain);
  const keyLocation = validateKeyLocation(config.keyLocation, origin);
  await assertPublicDns(new URL(keyLocation).hostname, dnsFetcher);
  let response: Response;
  try {
    response = await fetcher(keyLocation, {
      redirect: "manual",
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "Could not fetch the IndexNow key file.",
    );
  }
  if (!response.ok || response.status >= 300) {
    throw new AppError(
      "VALIDATION_ERROR",
      `IndexNow key file returned HTTP ${response.status}.`,
    );
  }
  const body = (await readTextCapped(response, 256)).trim();
  if (body !== config.publicKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "IndexNow key file does not match the configured key.",
    );
  }
  const keyVerifiedAt = new Date().toISOString();
  const marked = await IndexNowRepository.markVerified({
    configId: config.id,
    publicKey: config.publicKey,
    verifiedAt: keyVerifiedAt,
  });
  if (!marked) {
    throw new AppError(
      "CONFLICT",
      "IndexNow configuration changed during verification; retry.",
    );
  }
  return { verified: true as const, keyVerifiedAt };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: values.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await worker(values[index], index);
      }
    }),
  );
  return results;
}

async function sendChunk(
  urls: string[],
  chunkIndex: number,
  config: { publicKey: string; keyLocation: string },
  origin: string,
  fetcher: IndexNowFetcher,
): Promise<IndexNowChunkReceipt> {
  try {
    const body = JSON.stringify({
      host: new URL(origin).host,
      key: config.publicKey,
      keyLocation: config.keyLocation,
      urlList: urls,
    });
    if (
      new TextEncoder().encode(body).byteLength >
      INDEXNOW_MAX_OUTBOUND_BODY_BYTES
    ) {
      return {
        chunkIndex,
        urlCount: urls.length,
        status: "failed",
        httpStatus: null,
      };
    }
    const response = await fetcher(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    return {
      chunkIndex,
      urlCount: urls.length,
      status: response.ok
        ? "received"
        : response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429
          ? "rejected"
          : "failed",
      httpStatus: response.status,
    };
  } catch {
    return {
      chunkIndex,
      urlCount: urls.length,
      status: "failed",
      httpStatus: null,
    };
  }
}

async function submit(input: {
  projectId: string;
  userId: string;
  urls: string[];
  confirmed: boolean;
  fetcher?: IndexNowFetcher;
}) {
  if (!input.confirmed) {
    throw new AppError(
      "VALIDATION_ERROR",
      "IndexNow submission requires confirmed: true.",
    );
  }
  const parsedUrls = indexNowUrlsSchema.safeParse(input.urls);
  if (!parsedUrls.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      parsedUrls.error.issues[0]?.message ??
        `IndexNow accepts 1 to ${INDEXNOW_MAX_URLS} bounded URLs.`,
    );
  }
  const [config, domain] = await Promise.all([
    IndexNowRepository.getConfig(input.projectId),
    IndexNowRepository.getProjectDomain(input.projectId),
  ]);
  if (!config?.keyVerifiedAt || !domain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Verify the IndexNow key file before submitting URLs.",
    );
  }
  const origin = projectOrigin(domain);
  const keyLocation = validateKeyLocation(config.keyLocation, origin);
  const urls = normalizeIndexNowUrls(parsedUrls.data, origin, keyLocation);
  const chunks = Array.from(
    { length: Math.ceil(urls.length / INDEXNOW_CHUNK_SIZE) },
    (_, index) =>
      urls.slice(
        index * INDEXNOW_CHUNK_SIZE,
        (index + 1) * INDEXNOW_CHUNK_SIZE,
      ),
  );
  const receipts = await mapWithConcurrency(chunks, 3, (chunk, index) =>
    sendChunk(
      chunk,
      index,
      { publicKey: config.publicKey, keyLocation },
      origin,
      input.fetcher ?? fetch,
    ),
  );
  const receivedChunkCount = receipts.filter(
    (receipt) => receipt.status === "received",
  ).length;
  const rejectedChunkCount = receipts.filter(
    (receipt) => receipt.status === "rejected",
  ).length;
  const failedChunkCount = receipts.filter(
    (receipt) => receipt.status === "failed",
  ).length;
  const status =
    receivedChunkCount === receipts.length
      ? "received"
      : receivedChunkCount > 0
        ? "partially_received"
        : rejectedChunkCount > 0
          ? "rejected"
          : "failed";
  const submissionId = await IndexNowRepository.recordSubmission({
    projectId: input.projectId,
    configId: config.id,
    status,
    requestedUrlCount: parsedUrls.data.length,
    uniqueUrlCount: urls.length,
    chunkCount: receipts.length,
    receivedChunkCount,
    rejectedChunkCount,
    failedChunkCount,
    httpStatuses: receipts.flatMap((receipt) =>
      receipt.httpStatus === null ? [] : [receipt.httpStatus],
    ),
    submittedByUserId: input.userId,
    createdAt: new Date().toISOString(),
  });
  return {
    submissionId,
    status,
    requestedUrlCount: parsedUrls.data.length,
    uniqueUrlCount: urls.length,
    chunks: receipts,
    meaning:
      "received means the IndexNow endpoint accepted the notification; it does not mean the URLs were crawled or indexed.",
  };
}

export const IndexNowService = {
  configure,
  getStatus,
  verifyKey,
  submit,
};
