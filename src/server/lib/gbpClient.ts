import { getAuth } from "@/lib/auth";
import { GBP_OAUTH_PROVIDER_ID } from "@/shared/gbp";

const GBP_ACCOUNTS_API_BASE =
  "https://mybusinessaccountmanagement.googleapis.com/v1";
const GBP_BUSINESS_INFO_API_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const LOCATION_READ_MASK = [
  "name",
  "title",
  "storefrontAddress",
  "phoneNumbers",
  "categories",
  "regularHours",
  "websiteUri",
  "metadata",
].join(",");

/** A GBP REST call returned a non-2xx status. `status` drives user-facing messaging. */
export class GbpApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "GbpApiError";
  }
}

/** No fresh access token could be minted — the user revoked the grant, or the
 *  refresh token expired (e.g. weekly in Google's OAuth "Testing" mode). */
export class GbpTokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GbpTokenError";
  }
}

export type GbpAccount = {
  name: string;
  accountName?: string;
  type?: string;
};

export type GbpLocationSummary = {
  name: string;
  title?: string;
};

export type GbpAddress = {
  regionCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  addressLines?: string[];
};

export type GbpPhoneNumbers = {
  primaryPhone?: string;
  additionalPhones?: string[];
};

export type GbpCategory = {
  name?: string;
  displayName?: string;
};

export type GbpCategories = {
  primaryCategory?: GbpCategory;
  additionalCategories?: GbpCategory[];
};

export type GbpTimePeriod = {
  openDay?: string;
  openTime?: { hours?: number; minutes?: number };
  closeDay?: string;
  closeTime?: { hours?: number; minutes?: number };
};

export type GbpRegularHours = {
  periods?: GbpTimePeriod[];
};

export type GbpLocation = {
  name: string;
  title?: string;
  storefrontAddress?: GbpAddress;
  phoneNumbers?: GbpPhoneNumbers;
  categories?: GbpCategories;
  regularHours?: GbpRegularHours;
  websiteUri?: string;
  metadata?: { mapsUri?: string; newReviewUri?: string };
};

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Business Profile denied access to this location (no verified permission, or the connection was revoked).";
  }
  if (status === 429) {
    return "Business Profile rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Business Profile location not found. It may have been removed.";
  }
  return `Business Profile API error (${status}): ${body.slice(0, 300)}`;
}

/** Free Google Business Profile client. Like the GSC client, it does NOT meter
 *  credits — Business Profile is first-party data with no per-call cost. Access
 *  tokens are minted (and auto-refreshed) by Better Auth from the connector's
 *  stored google-business-profile grant. */
export function createGbpClient(opts: {
  userId: string;
  gbpAccountId?: string;
}) {
  async function getToken(): Promise<string> {
    let result: { accessToken?: string } | undefined;
    try {
      result = await getAuth().api.getAccessToken({
        body: {
          providerId: GBP_OAUTH_PROVIDER_ID,
          userId: opts.userId,
          ...(opts.gbpAccountId ? { accountId: opts.gbpAccountId } : {}),
        },
      });
    } catch (error) {
      throw new GbpTokenError(
        "Could not mint a Business Profile access token (grant revoked or expired).",
        error,
      );
    }
    if (!result?.accessToken) {
      throw new GbpTokenError(
        "Business Profile returned no access token (grant revoked or expired).",
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
      throw new GbpApiError(
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

    /** Account Management API `accounts.list` — the accounts the grant can manage. */
    async listAccounts(): Promise<GbpAccount[]> {
      const data = await request<{ accounts?: GbpAccount[] }>(
        `${GBP_ACCOUNTS_API_BASE}/accounts`,
      );
      return data.accounts ?? [];
    },

    /** Business Information API `accounts.locations.list` for one account. */
    async listLocations(accountName: string): Promise<GbpLocationSummary[]> {
      const data = await request<{ locations?: GbpLocationSummary[] }>(
        `${GBP_BUSINESS_INFO_API_BASE}/${accountName}/locations?readMask=name,title`,
      );
      return data.locations ?? [];
    },

    /** Business Information API `locations.get`, full profile fields. */
    async getLocation(locationName: string): Promise<GbpLocation> {
      return request<GbpLocation>(
        `${GBP_BUSINESS_INFO_API_BASE}/${locationName}?readMask=${LOCATION_READ_MASK}`,
      );
    },
  };
}
