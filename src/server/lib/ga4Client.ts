/* eslint-disable max-lines -- one client module per Google integration (gscClient precedent); GA4 spans the Admin and Data APIs */
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import {
  Ga4AdminApiError,
  Ga4DataApiError,
  Ga4MalformedResponseError,
  Ga4TokenError,
} from "@/server/lib/ga4Errors";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";

const GA4_ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const GA4_ADMIN_ALPHA_API_BASE =
  "https://analyticsadmin.googleapis.com/v1alpha";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const MAX_ACCOUNT_SUMMARY_PAGES = 100;
const MAX_ERROR_BODY_LENGTH = 8_000;
const propertyIdSchema = z.string().regex(/^properties\/\d+$/);
const dataStreamNameSchema = z
  .string()
  .regex(/^properties\/\d+\/dataStreams\/\d+$/);

const propertySummarySchema = z.object({
  property: propertyIdSchema,
  displayName: z.string(),
});

const accountSummarySchema = z.object({
  account: z.string().regex(/^accounts\/\d+$/),
  displayName: z.string(),
  propertySummaries: z.array(propertySummarySchema).optional(),
});

const accountSummariesResponseSchema = z.object({
  accountSummaries: z.array(accountSummarySchema).optional(),
  nextPageToken: z.string().optional(),
});

const propertySchema = z.object({
  name: propertyIdSchema,
  displayName: z.string(),
  timeZone: z.string().min(1),
  currencyCode: z.string().min(1),
});

const dataStreamSchema = z.object({
  name: dataStreamNameSchema,
  type: z.string(),
  displayName: z.string().default(""),
  createTime: z.string().optional(),
  updateTime: z.string().optional(),
  webStreamData: z
    .object({
      measurementId: z.string().optional(),
      defaultUri: z.string().optional(),
    })
    .optional(),
  androidAppStreamData: z
    .object({ packageName: z.string().optional() })
    .optional(),
  iosAppStreamData: z.object({ bundleId: z.string().optional() }).optional(),
});
const dataStreamsResponseSchema = z.object({
  dataStreams: z.array(dataStreamSchema).optional(),
  nextPageToken: z.string().optional(),
});
const enhancedMeasurementSettingsSchema = z.object({
  streamEnabled: z.boolean(),
  scrollsEnabled: z.boolean(),
  outboundClicksEnabled: z.boolean(),
  siteSearchEnabled: z.boolean(),
  videoEngagementEnabled: z.boolean(),
  fileDownloadsEnabled: z.boolean(),
  pageChangesEnabled: z.boolean(),
  formInteractionsEnabled: z.boolean(),
  searchQueryParameter: z.string(),
  uriQueryParameter: z.string().optional().default(""),
});
const keyEventSchema = z.object({
  eventName: z.string(),
  createTime: z.string().optional(),
  deletable: z.boolean().optional(),
  custom: z.boolean().optional(),
  countingMethod: z.string(),
  defaultValue: z
    .object({ numericValue: z.number(), currencyCode: z.string() })
    .optional(),
});
const keyEventsResponseSchema = z.object({
  keyEvents: z.array(keyEventSchema).optional(),
  nextPageToken: z.string().optional(),
});
const customDimensionSchema = z.object({
  parameterName: z.string(),
  displayName: z.string(),
  description: z.string().optional().default(""),
  scope: z.string(),
  disallowAdsPersonalization: z.boolean().optional().default(false),
});
const customDimensionsResponseSchema = z.object({
  customDimensions: z.array(customDimensionSchema).optional(),
  nextPageToken: z.string().optional(),
});
const customMetricSchema = z.object({
  parameterName: z.string(),
  displayName: z.string(),
  description: z.string().optional().default(""),
  measurementUnit: z.string(),
  scope: z.string(),
  restrictedMetricType: z.array(z.string()).optional().default([]),
});
const customMetricsResponseSchema = z.object({
  customMetrics: z.array(customMetricSchema).optional(),
  nextPageToken: z.string().optional(),
});

type Ga4PropertySummary = {
  propertyId: string;
  displayName: string;
  accountDisplayName: string;
};

type Ga4Property = z.infer<typeof propertySchema>;

async function getGa4AccessToken(opts: {
  userId: string;
  ga4AccountId: string;
}): Promise<string> {
  let result: { accessToken?: string } | undefined;
  try {
    result = await getAuth().api.getAccessToken({
      body: {
        providerId: GA4_OAUTH_PROVIDER_ID,
        userId: opts.userId,
        accountId: opts.ga4AccountId,
      },
    });
  } catch (error) {
    throw new Ga4TokenError(
      "Could not mint a Google Analytics access token.",
      error,
    );
  }
  if (!result?.accessToken) {
    throw new Ga4TokenError("Google Analytics returned no access token.");
  }
  return result.accessToken;
}

function adminMessageForStatus(status: number): string {
  if (status === 401) return "Google Analytics connection expired.";
  if (status === 403) {
    return "Google Analytics denied access. Check the account's property access and enabled APIs.";
  }
  if (status === 429) return "Google Analytics rate limit reached.";
  return `Google Analytics Admin API error (${status}).`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function memoizedGa4AccessToken(opts: {
  userId: string;
  ga4AccountId: string;
}) {
  let accessTokenPromise: Promise<string> | undefined;
  return () => (accessTokenPromise ??= getGa4AccessToken(opts));
}

/** Read-only Admin API client used only for account/property discovery. */
export function createGa4AdminClient(opts: {
  userId: string;
  ga4AccountId: string;
}) {
  const accessToken = memoizedGa4AccessToken(opts);

  async function request(url: string): Promise<unknown> {
    const token = await accessToken();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new Ga4AdminApiError(
        0,
        "Google Analytics Admin API is temporarily unavailable.",
      );
    }
    if (!response.ok) {
      throw new Ga4AdminApiError(
        response.status,
        adminMessageForStatus(response.status),
      );
    }
    return response.json();
  }

  function propertyUrl(base: string, propertyId: string, child: string): URL {
    const canonicalId = propertyIdSchema.parse(propertyId);
    return new URL(`${base}/${canonicalId}/${child}`);
  }

  return {
    async getUserInfoEmail(): Promise<string | null> {
      const data = z
        .object({ email: z.string().email().optional() })
        .parse(await request(GOOGLE_USERINFO_URL));
      return data.email ?? null;
    },

    async listProperties(): Promise<Ga4PropertySummary[]> {
      const properties: Ga4PropertySummary[] = [];
      let pageToken: string | undefined;

      for (let page = 0; page < MAX_ACCOUNT_SUMMARY_PAGES; page += 1) {
        const url = new URL(`${GA4_ADMIN_API_BASE}/accountSummaries`);
        url.searchParams.set("pageSize", "200");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = accountSummariesResponseSchema.parse(
          await request(url.toString()),
        );
        for (const account of response.accountSummaries ?? []) {
          for (const property of account.propertySummaries ?? []) {
            properties.push({
              propertyId: property.property,
              displayName: property.displayName,
              accountDisplayName: account.displayName,
            });
          }
        }

        pageToken = response.nextPageToken || undefined;
        if (!pageToken) return properties;
      }

      throw new Error(
        "Google Analytics property discovery exceeded 100 pages.",
      );
    },

    async getProperty(propertyId: string): Promise<Ga4Property> {
      const canonicalId = propertyIdSchema.parse(propertyId);
      return propertySchema.parse(
        await request(`${GA4_ADMIN_API_BASE}/${canonicalId}`),
      );
    },

    async listDataStreams(propertyId: string) {
      const url = propertyUrl(
        GA4_ADMIN_ALPHA_API_BASE,
        propertyId,
        "dataStreams",
      );
      url.searchParams.set("pageSize", "200");
      const response = dataStreamsResponseSchema.parse(
        await request(url.toString()),
      );
      return response.dataStreams ?? [];
    },

    async getEnhancedMeasurementSettings(streamName: string) {
      const canonicalName = dataStreamNameSchema.parse(streamName);
      return enhancedMeasurementSettingsSchema.parse(
        await request(
          `${GA4_ADMIN_ALPHA_API_BASE}/${canonicalName}/enhancedMeasurementSettings`,
        ),
      );
    },

    async listKeyEvents(propertyId: string) {
      const url = propertyUrl(GA4_ADMIN_API_BASE, propertyId, "keyEvents");
      url.searchParams.set("pageSize", "200");
      const response = keyEventsResponseSchema.parse(
        await request(url.toString()),
      );
      return response.keyEvents ?? [];
    },

    async listCustomDimensions(propertyId: string) {
      const url = propertyUrl(
        GA4_ADMIN_API_BASE,
        propertyId,
        "customDimensions",
      );
      url.searchParams.set("pageSize", "200");
      const response = customDimensionsResponseSchema.parse(
        await request(url.toString()),
      );
      return response.customDimensions ?? [];
    },

    async listCustomMetrics(propertyId: string) {
      const url = propertyUrl(GA4_ADMIN_API_BASE, propertyId, "customMetrics");
      url.searchParams.set("pageSize", "200");
      const response = customMetricsResponseSchema.parse(
        await request(url.toString()),
      );
      return response.customMetrics ?? [];
    },
  };
}

const quotaStatusSchema = z.object({
  consumed: z.number().int(),
  remaining: z.number().int(),
});

const propertyQuotaSchema = z.object({
  tokensPerDay: quotaStatusSchema.optional(),
  tokensPerHour: quotaStatusSchema.optional(),
  concurrentRequests: quotaStatusSchema.optional(),
  serverErrorsPerProjectPerHour: quotaStatusSchema.optional(),
  potentiallyThresholdedRequestsPerHour: quotaStatusSchema.optional(),
  tokensPerProjectPerHour: quotaStatusSchema.optional(),
});

const responseMetadataSchema = z.object({
  dataLossFromOtherRow: z.boolean().optional(),
  samplingMetadatas: z
    .array(
      z.object({
        samplesReadCount: z.string(),
        samplingSpaceSize: z.string(),
      }),
    )
    .optional(),
  schemaRestrictionResponse: z
    .object({
      activeMetricRestrictions: z
        .array(
          z.object({
            metricName: z.string(),
            restrictedMetricTypes: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  currencyCode: z.string().optional(),
  timeZone: z.string().optional(),
  emptyReason: z.string().optional(),
  subjectToThresholding: z.boolean().optional(),
});

const runReportResponseSchema = z.object({
  dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
  metricHeaders: z
    .array(z.object({ name: z.string(), type: z.string().optional() }))
    .optional(),
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string() })).optional(),
        metricValues: z.array(z.object({ value: z.string() })).optional(),
      }),
    )
    .optional(),
  rowCount: z.number().int().nonnegative().optional(),
  metadata: responseMetadataSchema.optional(),
  propertyQuota: propertyQuotaSchema.optional(),
  kind: z.string().optional(),
});

const googleErrorSchema = z.object({
  error: z.object({
    details: z
      .array(
        z.object({
          reason: z.string().optional(),
          metadata: z.object({ service: z.string().optional() }).optional(),
        }),
      )
      .optional(),
  }),
});

export type Ga4RunReportResponse = z.infer<typeof runReportResponseSchema>;

export type Ga4RunReportRequest = {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: unknown;
  metricFilter?: unknown;
  offset: string;
  limit: string;
  orderBys: Array<{
    metric?: { metricName: string };
    dimension?: { dimensionName: string };
    desc?: boolean;
  }>;
  keepEmptyRows: false;
  returnPropertyQuota: true;
};

function safeRetryAfter(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return null;
  return Math.min(Number(value), 86_400);
}

function dataMessageForStatus(status: number): string {
  if (status === 400) return "Google Analytics rejected this report.";
  if (status === 401) return "Google Analytics connection expired.";
  if (status === 403) return "Google Analytics denied access to this property.";
  if (status === 429) return "Google Analytics reporting quota was exhausted.";
  return "Google Analytics reporting is temporarily unavailable.";
}

export function createGa4DataClient(opts: {
  userId: string;
  ga4AccountId: string;
  propertyId: string;
}) {
  const propertyId = propertyIdSchema.parse(opts.propertyId);
  const accessToken = memoizedGa4AccessToken(opts);

  return {
    async runReport(
      request: Ga4RunReportRequest,
    ): Promise<Ga4RunReportResponse> {
      const token = await accessToken();
      let response: Response;
      try {
        response = await fetch(`${GA4_DATA_API_BASE}/${propertyId}:runReport`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new Ga4DataApiError(
          0,
          "Google Analytics reporting is temporarily unavailable.",
        );
      }
      if (!response.ok) {
        const body = await response
          .text()
          .then((responseBody) => responseBody.slice(0, MAX_ERROR_BODY_LENGTH))
          .catch(() => "");
        let upstreamReason: string | null = null;
        try {
          const parsed = googleErrorSchema.safeParse(JSON.parse(body));
          if (parsed.success) {
            upstreamReason =
              parsed.data.error.details?.find(
                (detail) =>
                  detail.metadata?.service === "analyticsdata.googleapis.com",
              )?.reason ??
              parsed.data.error.details?.find((detail) => detail.reason)
                ?.reason ??
              null;
          }
        } catch {
          // Non-JSON error pages intentionally collapse to status-only errors.
        }
        throw new Ga4DataApiError(
          response.status,
          dataMessageForStatus(response.status),
          safeRetryAfter(response),
          upstreamReason,
        );
      }

      try {
        return runReportResponseSchema.parse(await response.json());
      } catch {
        throw new Ga4MalformedResponseError();
      }
    },
  };
}
