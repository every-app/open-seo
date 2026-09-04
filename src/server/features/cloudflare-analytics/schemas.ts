import { z } from "zod";

const finiteNumber = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: "Expected a finite number" });
      return z.NEVER;
    }
    return parsed;
  });

const cloudflareDatasetCapabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
});

export const cloudflareCapabilitiesSchema = z.object({
  traffic: cloudflareDatasetCapabilitySchema,
  securityEvents: cloudflareDatasetCapabilitySchema,
  crawlerAccess: cloudflareDatasetCapabilitySchema,
});

export type CloudflareCapabilities = z.infer<
  typeof cloudflareCapabilitiesSchema
>;

const resultStatusSchema = z.enum([
  "ok",
  "partial",
  "no_data",
  "not_connected",
  "unavailable",
  "rate_limited",
]);

const resultMetaSchema = z.object({
  source: z.literal("cloudflare_analytics"),
  status: resultStatusSchema,
  window: z
    .object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      timezone: z.literal("UTC"),
      granularity: z.literal("hour"),
    })
    .nullable(),
  coverage: z.object({
    sampled: z.boolean(),
    truncated: z.boolean(),
  }),
  warnings: z.array(z.string()),
});

function cloudflareResultSchema<T extends z.ZodType>(dataSchema: T) {
  return resultMetaSchema.extend({ data: dataSchema.nullable() });
}

const dataCapabilities = { capabilities: cloudflareCapabilitiesSchema };

export const cloudflareTrafficResultSchema = cloudflareResultSchema(
  z.object({
    requests: z.number().nonnegative(),
    responseBytes: z.number().nonnegative(),
    visits: z.number().nonnegative().nullable(),
    statuses: z.array(
      z.object({
        status: z.number().int().nonnegative(),
        requests: z.number().nonnegative(),
      }),
    ),
    errors4xx: z.number().nonnegative(),
    errors5xx: z.number().nonnegative(),
    ...dataCapabilities,
  }),
);

export const cloudflareSecurityResultSchema = cloudflareResultSchema(
  z.object({
    totalEvents: z.number().nonnegative(),
    events: z.array(
      z.object({
        action: z.string(),
        source: z.string().nullable(),
        ruleId: z.string().nullable(),
        host: z.string().nullable(),
        pathname: z.string().nullable(),
        count: z.number().nonnegative(),
      }),
    ),
    ...dataCapabilities,
  }),
);

export const cloudflareCrawlerResultSchema = cloudflareResultSchema(
  z.object({
    crawlers: z.array(
      z.object({
        crawler: z.enum(["googlebot", "bingbot"]),
        requests: z.number().nonnegative(),
        successful: z.number().nonnegative(),
        blocked: z.number().nonnegative(),
        serverErrors: z.number().nonnegative(),
        pages: z.array(
          z.object({
            host: z.string(),
            pathname: z.string(),
            status: z.number().int().nonnegative(),
            requests: z.number().nonnegative(),
          }),
        ),
      }),
    ),
    ...dataCapabilities,
  }),
);

const graphqlErrorSchema = z.object({
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])).nullish(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const graphqlResponseSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(graphqlErrorSchema).nullish(),
});

const trafficGroupSchema = z.object({
  count: finiteNumber,
  dimensions: z.object({
    datetimeHour: z.string().optional(),
    edgeResponseStatus: finiteNumber.optional(),
  }),
  sum: z
    .object({
      edgeResponseBytes: finiteNumber.optional(),
      visits: finiteNumber.optional(),
    })
    .optional(),
  avg: z.object({ sampleInterval: finiteNumber.optional() }).optional(),
});

export const trafficGraphqlDataSchema = z.object({
  viewer: z.object({
    zones: z.array(
      z.object({ httpRequestsAdaptiveGroups: z.array(trafficGroupSchema) }),
    ),
  }),
});

const securityGroupSchema = z.object({
  count: finiteNumber,
  avg: z.object({ sampleInterval: finiteNumber.optional() }).optional(),
  dimensions: z.object({
    action: z.string().optional(),
    source: z.string().optional(),
    ruleId: z.string().optional(),
    clientRequestHTTPHost: z.string().optional(),
    clientRequestPath: z.string().optional(),
  }),
});

export const securityGraphqlDataSchema = z.object({
  viewer: z.object({
    zones: z.array(
      z.object({ firewallEventsAdaptiveGroups: z.array(securityGroupSchema) }),
    ),
  }),
});

const crawlerGroupSchema = z.object({
  count: finiteNumber,
  avg: z.object({ sampleInterval: finiteNumber.optional() }).optional(),
  dimensions: z.object({
    clientRequestHTTPHost: z.string().optional(),
    clientRequestPath: z.string().optional(),
    edgeResponseStatus: finiteNumber.optional(),
  }),
});

export const crawlerGraphqlDataSchema = z.object({
  viewer: z.object({
    zones: z.array(
      z.object({
        googlebot: z.array(crawlerGroupSchema),
        bingbot: z.array(crawlerGroupSchema),
      }),
    ),
  }),
});

export type CloudflareTrafficResult = z.infer<
  typeof cloudflareTrafficResultSchema
>;
export type CloudflareSecurityResult = z.infer<
  typeof cloudflareSecurityResultSchema
>;
export type CloudflareCrawlerResult = z.infer<
  typeof cloudflareCrawlerResultSchema
>;
