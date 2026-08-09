import { getAuth } from "@/lib/auth";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";

const GA4_ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** A GA4 REST call returned a non-2xx status. `status` drives user-facing messaging. */
export class Ga4ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "Ga4ApiError";
  }
}

/** No fresh access token could be minted — the user revoked the grant, or the
 *  refresh token expired (e.g. weekly in Google's OAuth "Testing" mode). */
export class Ga4TokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "Ga4TokenError";
  }
}

export type Ga4Property = {
  /** Resource name, e.g. "properties/123456789". Stored and matched verbatim. */
  property: string;
  displayName: string;
  parent: string;
};

export type Ga4AccountSummary = {
  account: string;
  displayName: string;
  propertySummaries: Ga4Property[];
};

export type Ga4DimensionFilter = {
  dimension: string;
  operator: string;
  expression: string;
};

/** Minimal shape of GA4's recursive `FilterExpression` — only what this
 *  project's tool actually constructs (single string-match filters, negated,
 *  or AND-combined). The real API type is broader (orGroup, numeric/in-list
 *  filters); extend here if a future dimension needs them. */
export type Ga4FilterExpression =
  | {
      filter: {
        fieldName: string;
        stringFilter: {
          matchType: "EXACT" | "CONTAINS";
          value: string;
          caseSensitive: boolean;
        };
      };
    }
  | { notExpression: Ga4FilterExpression }
  | { andGroup: { expressions: Ga4FilterExpression[] } };

export type Ga4RunReportRequest = {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: Ga4FilterExpression;
  limit?: number;
  offset?: number;
};

export type Ga4RunReportRow = {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
};

export type Ga4RunReportResponse = {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type?: string }>;
  rows?: Ga4RunReportRow[];
  rowCount?: number;
};

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Analytics denied access to this property (no verified permission, or the connection was revoked).";
  }
  if (status === 429) {
    return "Analytics rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Analytics property not found. It may have been removed in Google Analytics.";
  }
  return `Analytics API error (${status}): ${body.slice(0, 300)}`;
}

/** Free Google Analytics (GA4) client. Unlike the DataForSEO client it does NOT
 *  meter credits — GA4 is first-party data with no per-call cost. Access tokens
 *  are minted (and auto-refreshed) by Better Auth from the connector's stored
 *  google-analytics grant. */
export function createGa4Client(opts: {
  userId: string;
  ga4AccountId?: string;
}) {
  async function getToken(): Promise<string> {
    let result: { accessToken?: string } | undefined;
    try {
      // Headerless call: getAccessToken trusts body.userId when no request
      // session is present, and auto-refreshes via the genericOAuth provider.
      // Works in every auth mode — self-hosted builds the same Better Auth
      // instance once BETTER_AUTH_SECRET is set.
      result = await getAuth().api.getAccessToken({
        body: {
          providerId: GA4_OAUTH_PROVIDER_ID,
          userId: opts.userId,
          ...(opts.ga4AccountId ? { accountId: opts.ga4AccountId } : {}),
        },
      });
    } catch (error) {
      throw new Ga4TokenError(
        "Could not mint an Analytics access token (grant revoked or expired).",
        error,
      );
    }
    if (!result?.accessToken) {
      throw new Ga4TokenError(
        "Analytics returned no access token (grant revoked or expired).",
      );
    }
    return result.accessToken;
  }

  async function request<T>(
    url: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const token = await getToken();
    const hasBody = init?.body !== undefined;
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(init?.body) : undefined,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Ga4ApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    return (await response.json()) as T;
  }

  return {
    async getUserInfoEmail(): Promise<string | null> {
      const data = await request<{ email?: unknown }>(GOOGLE_USERINFO_URL);
      return typeof data.email === "string" ? data.email : null;
    },

    /** Admin API `accountSummaries.list` — every account/property the grant can
     *  see. Paginated by Google; followed to completion so a multi-page
     *  account never silently truncates the property picker. */
    async listAccountSummaries(): Promise<Ga4AccountSummary[]> {
      const summaries: Ga4AccountSummary[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(`${GA4_ADMIN_API_BASE}/accountSummaries`);
        url.searchParams.set("pageSize", "200");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const data = await request<{
          accountSummaries?: Ga4AccountSummary[];
          nextPageToken?: string;
        }>(url.toString());
        summaries.push(...(data.accountSummaries ?? []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return summaries;
    },

    /** Data API `properties.runReport`. propertyId is used verbatim — it's the
     *  full resource name, e.g. "properties/123456789". */
    async runReport(
      propertyId: string,
      body: Ga4RunReportRequest,
    ): Promise<Ga4RunReportResponse> {
      return request<Ga4RunReportResponse>(
        `${GA4_DATA_API_BASE}/${propertyId}:runReport`,
        { method: "POST", body },
      );
    },
  };
}
