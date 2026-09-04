import type { z } from "zod";
import {
  CloudflareAnalyticsError,
  CLOUDFLARE_MAX_RETRY_AFTER_SECONDS,
} from "./CloudflareAnalyticsError";
import {
  crawlerGraphqlDataSchema,
  graphqlResponseSchema,
  securityGraphqlDataSchema,
  trafficGraphqlDataSchema,
} from "./schemas";

const CLOUDFLARE_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const ROW_LIMIT = 500;
const CLOUDFLARE_REQUEST_TIMEOUT_MS = 15_000;
export const CLOUDFLARE_MAX_RESPONSE_BYTES = 1_000_000;

/**
 * Cloudflare-verified detection IDs from the public bot reference. These IDs
 * require Bot Management. Never fall back to spoofable User-Agent matching.
 * https://developers.cloudflare.com/ai-crawl-control/reference/bots/
 */
const SEARCH_CRAWLER_DETECTION_IDS = {
  googlebot: [120_623_194, 33_554_459],
  bingbot: [117_479_730, 33_554_461],
} as const;

export const CLOUDFLARE_TRAFFIC_QUERY = /* GraphQL */ `
  query OpenSeoCloudflareTraffic(
    $zoneTag: String!
    $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!
  ) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequestsAdaptiveGroups(
          limit: ${ROW_LIMIT}
          filter: $filter
          orderBy: [datetimeHour_ASC]
        ) {
          count
          dimensions { datetimeHour edgeResponseStatus }
          sum { edgeResponseBytes visits }
          avg { sampleInterval }
        }
      }
    }
  }
`;

export const CLOUDFLARE_SECURITY_QUERY = /* GraphQL */ `
  query OpenSeoCloudflareSecurity(
    $zoneTag: String!
    $filter: ZoneFirewallEventsAdaptiveGroupsFilter_InputObject!
  ) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        firewallEventsAdaptiveGroups(
          limit: ${ROW_LIMIT}
          filter: $filter
          orderBy: [count_DESC]
        ) {
          count
          avg { sampleInterval }
          dimensions {
            action
            source
            ruleId
            clientRequestHTTPHost
            clientRequestPath
          }
        }
      }
    }
  }
`;

export const CLOUDFLARE_CRAWLER_QUERY = /* GraphQL */ `
  query OpenSeoCloudflareCrawlerAccess(
    $zoneTag: String!
    $googleFilter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!
    $bingFilter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!
  ) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        googlebot: httpRequestsAdaptiveGroups(
          limit: ${ROW_LIMIT}
          filter: $googleFilter
          orderBy: [count_DESC]
        ) {
          count
          dimensions {
            clientRequestHTTPHost
            clientRequestPath
            edgeResponseStatus
          }
          avg { sampleInterval }
        }
        bingbot: httpRequestsAdaptiveGroups(
          limit: ${ROW_LIMIT}
          filter: $bingFilter
          orderBy: [count_DESC]
        ) {
          count
          dimensions {
            clientRequestHTTPHost
            clientRequestPath
            edgeResponseStatus
          }
          avg { sampleInterval }
        }
      }
    }
  }
`;

const MAX_PROVIDER_ERRORS = 5;
const MAX_PROVIDER_ERROR_LENGTH = 300;
const DATASET_ACCESSIBILITY_ERROR_PATTERNS = [
  /^cannot request data older than\b/i,
  /^number of fields (?:can't|cannot) be more than\b/i,
  /^limit must be positive number and not greater than\b/i,
  /^query time range is too large\b/i,
] as const;

type CloudflareFetch = typeof fetch;

export type CloudflareGraphqlResult<T> = {
  data: T | null;
  errors: string[];
};

function boundedProviderErrors(errors: readonly string[]): string[] {
  return errors
    .slice(0, MAX_PROVIDER_ERRORS)
    .map((message) => message.slice(0, MAX_PROVIDER_ERROR_LENGTH));
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(CLOUDFLARE_MAX_RETRY_AFTER_SECONDS, Math.ceil(seconds));
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(
        CLOUDFLARE_MAX_RETRY_AFTER_SECONDS,
        Math.max(0, Math.ceil((date - Date.now()) / 1_000)),
      )
    : undefined;
}

function statusError(
  response: Response,
  responseErrors: readonly string[] = [],
): CloudflareAnalyticsError {
  if (response.status === 401 || response.status === 403) {
    return new CloudflareAnalyticsError(
      "authentication_failed",
      "Cloudflare rejected the Analytics token.",
    );
  }
  if (response.status === 429) {
    return new CloudflareAnalyticsError(
      "rate_limited",
      "Cloudflare Analytics rate limit reached.",
      retryAfterSeconds(response),
    );
  }
  if (response.status === 400) {
    const providerErrors = boundedProviderErrors(responseErrors);
    const datasetUnavailable =
      providerErrors.length > 0 &&
      providerErrors.every((message) =>
        DATASET_ACCESSIBILITY_ERROR_PATTERNS.some((pattern) =>
          pattern.test(message),
        ),
      );
    return new CloudflareAnalyticsError(
      datasetUnavailable ? "dataset_unavailable" : "invalid_response",
      datasetUnavailable
        ? "Cloudflare Analytics rejected this dataset window or plan limit."
        : "Cloudflare Analytics rejected the GraphQL query.",
      undefined,
      providerErrors,
    );
  }
  return new CloudflareAnalyticsError(
    "upstream_unavailable",
    `Cloudflare Analytics returned HTTP ${response.status}.`,
  );
}

async function parseGraphqlResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<CloudflareGraphqlResult<T>> {
  if (!response.ok && response.status !== 400) throw statusError(response);

  let json: unknown;
  try {
    json = await readBoundedJson(response);
  } catch (error) {
    if (error instanceof CloudflareAnalyticsError) throw error;
    if (!response.ok) throw statusError(response);
    throw new CloudflareAnalyticsError(
      "invalid_response",
      "Cloudflare Analytics returned invalid JSON.",
    );
  }
  const envelope = graphqlResponseSchema.safeParse(json);
  if (!envelope.success) {
    if (!response.ok) throw statusError(response);
    throw new CloudflareAnalyticsError(
      "invalid_response",
      "Cloudflare Analytics returned an unexpected response shape.",
    );
  }
  const errors = (envelope.data.errors ?? []).map((error) => error.message);
  if (!response.ok) throw statusError(response, errors);
  if (envelope.data.data == null) return { data: null, errors };

  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    if (errors.length > 0) return { data: null, errors };
    throw new CloudflareAnalyticsError(
      "invalid_response",
      "Cloudflare Analytics returned malformed dataset rows.",
    );
  }
  return { data: parsed.data, errors };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > CLOUDFLARE_MAX_RESPONSE_BYTES
  ) {
    throw new CloudflareAnalyticsError(
      "invalid_response",
      "Cloudflare Analytics response exceeded the size limit.",
    );
  }
  if (!response.body) return JSON.parse(await response.text());

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > CLOUDFLARE_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new CloudflareAnalyticsError(
        "invalid_response",
        "Cloudflare Analytics response exceeded the size limit.",
      );
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

export function createCloudflareAnalyticsClient(
  fetcher: CloudflareFetch = fetch,
) {
  async function query<T>(input: {
    apiToken: string;
    query: string;
    variables: Record<string, unknown>;
    schema: z.ZodType<T>;
  }): Promise<CloudflareGraphqlResult<T>> {
    let response: Response;
    try {
      response = await fetcher(CLOUDFLARE_GRAPHQL_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiToken}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          query: input.query,
          variables: input.variables,
        }),
      });
    } catch {
      throw new CloudflareAnalyticsError(
        "upstream_unavailable",
        "Cloudflare Analytics could not be reached.",
      );
    }
    return parseGraphqlResponse(response, input.schema);
  }

  return {
    traffic(input: {
      apiToken: string;
      zoneId: string;
      from: string;
      to: string;
    }) {
      return query({
        apiToken: input.apiToken,
        query: CLOUDFLARE_TRAFFIC_QUERY,
        variables: {
          zoneTag: input.zoneId,
          filter: { datetime_geq: input.from, datetime_leq: input.to },
        },
        schema: trafficGraphqlDataSchema,
      });
    },
    securityEvents(input: {
      apiToken: string;
      zoneId: string;
      from: string;
      to: string;
    }) {
      return query({
        apiToken: input.apiToken,
        query: CLOUDFLARE_SECURITY_QUERY,
        variables: {
          zoneTag: input.zoneId,
          filter: { datetime_geq: input.from, datetime_leq: input.to },
        },
        schema: securityGraphqlDataSchema,
      });
    },
    crawlerAccess(input: {
      apiToken: string;
      zoneId: string;
      from: string;
      to: string;
    }) {
      const timeFilter = {
        datetime_geq: input.from,
        datetime_leq: input.to,
        requestSource: "eyeball",
      };
      return query({
        apiToken: input.apiToken,
        query: CLOUDFLARE_CRAWLER_QUERY,
        variables: {
          zoneTag: input.zoneId,
          googleFilter: {
            ...timeFilter,
            botDetectionIds_hasany: SEARCH_CRAWLER_DETECTION_IDS.googlebot,
          },
          bingFilter: {
            ...timeFilter,
            botDetectionIds_hasany: SEARCH_CRAWLER_DETECTION_IDS.bingbot,
          },
        },
        schema: crawlerGraphqlDataSchema,
      });
    },
  };
}

export type CloudflareAnalyticsClient = ReturnType<
  typeof createCloudflareAnalyticsClient
>;

export const cloudflareAnalyticsClient = createCloudflareAnalyticsClient();
