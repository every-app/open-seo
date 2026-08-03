import { z } from "zod";

import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

/** A RapidAPI Platform API call failed — either a non-2xx HTTP status or a
 *  GraphQL-level error. 401/403 mean the key was revoked or lacks Platform
 *  API access — surfaced as a reconnect prompt, like Vercel's expected
 *  failures. */
export class RapidApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "RapidApiError";
  }
}

export function isExpectedRapidapiFailure(error: unknown): boolean {
  return (
    error instanceof RapidApiError &&
    (error.status === 401 || error.status === 403)
  );
}

/** Whether the instance-level RapidAPI secrets are configured. The GraphQL
 *  Platform API lives at a per-hub URL (https://graphql-<hub>.p.rapidapi.com),
 *  so the endpoint is config too, not a constant. Drives the setup-card UI;
 *  mirrors hasVercelToken. */
export async function hasRapidapiConfig(): Promise<boolean> {
  const [url, key] = await Promise.all([
    getOptionalEnvValue("RAPIDAPI_GRAPHQL_URL"),
    getOptionalEnvValue("RAPIDAPI_KEY"),
  ]);
  return Boolean(url && key);
}

/** One subscription to the connected API listing, normalized from the
 *  Platform API's Subscription node. Plan fields are null when the hub's
 *  schema doesn't expose billingPlanVersion on subscriptions.
 *
 *  Deliberately PII-free: the query never requests the subscriber's name or
 *  email, only the opaque entity id and type. */
export type RapidapiSubscription = {
  id: string;
  status: string | null;
  createdAt: string | null;
  canceledAt: string | null;
  entityType: string | null;
  entityId: string | null;
  /** Which API the node actually belongs to. The Platform API silently
   *  ignores an unrecognized where.apiId and returns the CALLER's own
   *  subscriptions (verified live 2026-08-03), so callers must scope nodes
   *  by this instead of trusting the filter. */
  apiId: string | null;
  apiName: string | null;
  planName: string | null;
  /** Recurring plan price in the hub's currency units; 0 = free plan. */
  planPrice: number | null;
};

export type RapidapiSubscriptionsResult = {
  totalCount: number | null;
  /** False when the schema fallback dropped billingPlanVersion — paying vs
   *  free can't be told apart in that case. */
  planInfoAvailable: boolean;
  subscriptions: RapidapiSubscription[];
};

const graphqlResponseSchema = z.looseObject({
  data: z.record(z.string(), z.unknown()).nullish(),
  errors: z.array(z.looseObject({ message: z.string().nullish() })).nullish(),
});

const subscriptionNodeSchema = z.looseObject({
  id: z.union([z.string(), z.number()]).transform(String),
  status: z.string().nullish(),
  createdAt: z.union([z.string(), z.number()]).nullish(),
  canceledAt: z.union([z.string(), z.number()]).nullish(),
  entity: z
    .looseObject({
      type: z.string().nullish(),
      id: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
  api: z
    .looseObject({
      id: z.union([z.string(), z.number()]).nullish(),
      name: z.string().nullish(),
    })
    .nullish(),
  billingPlanVersion: z
    .looseObject({
      name: z.string().nullish(),
      price: z.number().nullish(),
    })
    .nullish(),
});

const subscriptionsDataSchema = z.looseObject({
  subscriptions: z.looseObject({
    nodes: z.array(z.record(z.string(), z.unknown())),
    totalCount: z.number().nullish(),
  }),
});

function asId(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** The Platform API reports dates as ISO strings in the docs, but GraphQL
 *  timestamps elsewhere on RapidAPI are epoch millis — accept both. */
function normalizeDate(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// entity.name and entity.email are intentionally not requested — subscriber
// counts and churn need only opaque ids, so PII never enters the app.
const SUBSCRIPTION_FIELDS = `
      id
      status
      createdAt
      canceledAt
      entity {
        type
        id
      }
      api {
        id
        name
      }`;

/** Primary query — includes the plan so paying and free subscribers can be
 *  told apart. Not every hub's schema exposes billingPlanVersion on
 *  Subscription (the public docs only guarantee the basic fields), so
 *  getSubscriptions falls back to the basic variant on a GraphQL error. */
const RICH_QUERY = `query subscriptions($where: SubscriptionsWhereInput) {
  subscriptions(where: $where) {
    nodes {${SUBSCRIPTION_FIELDS}
      billingPlanVersion {
        name
        price
      }
    }
    totalCount
  }
}`;

const BASIC_QUERY = `query subscriptions($where: SubscriptionsWhereInput) {
  subscriptions(where: $where) {
    nodes {${SUBSCRIPTION_FIELDS}
    }
    totalCount
  }
}`;

export function createRapidapiClient() {
  async function graphql(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [url, key] = await Promise.all([
      getRequiredEnvValue("RAPIDAPI_GRAPHQL_URL"),
      getRequiredEnvValue("RAPIDAPI_KEY"),
    ]);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rapidapi-host": new URL(url).host,
        "x-rapidapi-key": key,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message =
        response.status === 401 || response.status === 403
          ? "RapidAPI rejected the key (revoked, or missing GraphQL Platform API access). Update RAPIDAPI_KEY / RAPIDAPI_GRAPHQL_URL to continue."
          : `RapidAPI Platform API error (${response.status}): ${body.slice(0, 300)}`;
      throw new RapidApiError(response.status, message, body);
    }
    const parsed = graphqlResponseSchema.parse(await response.json());
    if (parsed.errors?.length || !parsed.data) {
      const message =
        parsed.errors?.[0]?.message ?? "RapidAPI returned no data";
      // GraphQL-level failures arrive with HTTP 200; status 0 marks them.
      throw new RapidApiError(0, `RapidAPI GraphQL error: ${message}`);
    }
    return parsed.data;
  }

  return {
    /** All subscriptions to one API listing. Tries the plan-aware query
     *  first and retries without billingPlanVersion when the hub's schema
     *  rejects it. */
    async getSubscriptions(
      apiId: string,
    ): Promise<RapidapiSubscriptionsResult> {
      const variables = { where: { apiId } };
      let planInfoAvailable = true;
      let data: Record<string, unknown>;
      try {
        data = await graphql(RICH_QUERY, variables);
      } catch (error) {
        if (!(error instanceof RapidApiError) || error.status !== 0)
          throw error;
        planInfoAvailable = false;
        data = await graphql(BASIC_QUERY, variables);
      }
      const { subscriptions } = subscriptionsDataSchema.parse(data);
      const nodes = subscriptions.nodes.map((raw) => {
        const node = subscriptionNodeSchema.parse(raw);
        return {
          id: node.id,
          status: node.status ?? null,
          createdAt: normalizeDate(node.createdAt),
          canceledAt: normalizeDate(node.canceledAt),
          entityType: node.entity?.type ?? null,
          entityId: asId(node.entity?.id),
          apiId: asId(node.api?.id),
          apiName: node.api?.name ?? null,
          planName: node.billingPlanVersion?.name ?? null,
          planPrice: node.billingPlanVersion?.price ?? null,
        };
      });
      return {
        totalCount: subscriptions.totalCount ?? nodes.length,
        planInfoAvailable:
          planInfoAvailable && nodes.some((node) => node.planPrice !== null),
        subscriptions: nodes,
      };
    },
  };
}
