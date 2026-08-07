import {
  INDEXNOW_API_URL,
  INDEXNOW_BATCH_LIMIT,
} from "@/shared/indexnow";

export type IndexNowSubmissionInput = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export type IndexNowSubmission = {
  status: "submitted";
  httpStatus: 200 | 202;
  responseBody: string;
};

/** A request to IndexNow returned a non-success status. */
export class IndexNowApiError extends Error {
  public readonly retryable: boolean;

  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "IndexNowApiError";
    this.retryable = status === 429 || status >= 500;
  }
}

function messageForStatus(status: number, body: string): string {
  if (status === 400) return "IndexNow rejected the request as invalid.";
  if (status === 403) return "IndexNow could not verify the submitted key.";
  if (status === 422) return "IndexNow rejected URLs that are not on the configured host.";
  if (status === 429) return "IndexNow rate limit reached. Retry shortly.";
  return `IndexNow API error (${status}): ${body.slice(0, 300)}`;
}

export function createIndexNowClient(fetchImpl: typeof fetch = fetch) {
  return {
    async submitUrls(
      input: IndexNowSubmissionInput,
    ): Promise<IndexNowSubmission> {
      if (input.urlList.length > INDEXNOW_BATCH_LIMIT) {
        throw new IndexNowApiError(
          400,
          `IndexNow accepts at most ${INDEXNOW_BATCH_LIMIT.toLocaleString()} URLs per request`,
        );
      }

      const response = await fetchImpl(INDEXNOW_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const responseBody = await response.text().catch(() => "");

      if (response.status === 200 || response.status === 202) {
        return {
          status: "submitted",
          httpStatus: response.status,
          responseBody,
        };
      }

      throw new IndexNowApiError(
        response.status,
        messageForStatus(response.status, responseBody),
        responseBody,
      );
    },
  };
}

export async function submitIndexNowUrls(
  input: IndexNowSubmissionInput,
): Promise<IndexNowSubmission> {
  return createIndexNowClient().submitUrls(input);
}
