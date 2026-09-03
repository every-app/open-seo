import { z } from "zod";
import {
  ClarityApiError,
  ClarityMalformedResponseError,
} from "@/server/lib/clarityErrors";

const CLARITY_DATA_EXPORT_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const CLARITY_REQUEST_TIMEOUT_MS = 15_000;
const CLARITY_MAX_PROVIDER_RESPONSE_BYTES = 8_000_000;
export const CLARITY_URL_JOIN_KEY = "openSeoUrlJoinKey";

export const clarityDimensionSchema = z.enum([
  "Browser",
  "Device",
  "Country/Region",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
]);

const clarityScalarSchema = z.union([
  z.string().max(16_384),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const clarityInformationRowSchema = z
  .record(z.string().max(128), clarityScalarSchema)
  .refine((row) => Object.keys(row).length <= 64);
const clarityCachedInformationRowSchema = z
  .record(z.string().max(128), clarityScalarSchema)
  .refine((row) => {
    const keys = Object.keys(row);
    if (keys.length <= 64) return true;
    return (
      keys.length === 65 &&
      typeof row[CLARITY_URL_JOIN_KEY] === "string" &&
      /^url-\d{6}$/u.test(row[CLARITY_URL_JOIN_KEY])
    );
  });
const clarityMetricSchema = z
  .object({
    metricName: z.string().min(1).max(128),
    information: z.array(clarityInformationRowSchema).max(1_000),
    openSeoOriginalInformationRows: z
      .number()
      .int()
      .nonnegative()
      .max(1_000)
      .optional(),
  })
  .strip();
const clarityResponseSchema = z.array(clarityMetricSchema).max(64);
const clarityCachedResponseSchema = z
  .array(
    clarityMetricSchema.extend({
      information: z.array(clarityCachedInformationRowSchema).max(1_000),
    }),
  )
  .max(64);

export type ClarityDimension = z.infer<typeof clarityDimensionSchema>;
export type ClarityDataExportResponse = z.infer<typeof clarityResponseSchema>;

function safeRetryAfter(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return null;
  return Math.min(Number(value), 86_400);
}

function messageForStatus(status: number): string {
  if (status === 400) return "Microsoft Clarity rejected the report request.";
  if (status === 401)
    return "The Microsoft Clarity token is invalid or expired.";
  if (status === 403)
    return "The Microsoft Clarity token is not authorized for this project.";
  if (status === 429)
    return "Microsoft Clarity's daily Data Export limit was reached.";
  return "Microsoft Clarity Data Export is temporarily unavailable.";
}

export function parseClarityResponse(
  value: unknown,
): ClarityDataExportResponse {
  const parsed = clarityResponseSchema.safeParse(value);
  if (!parsed.success) throw new ClarityMalformedResponseError();
  return parsed.data;
}

export function parseClarityCachedResponse(
  value: unknown,
): ClarityDataExportResponse {
  const parsed = clarityCachedResponseSchema.safeParse(value);
  if (!parsed.success) throw new ClarityMalformedResponseError();
  return parsed.data;
}

export async function fetchClarityReport(input: {
  apiToken: string;
  numOfDays: 1 | 2 | 3;
  dimensions?: readonly ClarityDimension[];
}): Promise<ClarityDataExportResponse> {
  const url = new URL(CLARITY_DATA_EXPORT_URL);
  url.searchParams.set("numOfDays", String(input.numOfDays));
  for (const [index, dimension] of (input.dimensions ?? []).entries()) {
    url.searchParams.set(`dimension${index + 1}`, dimension);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.apiToken}`,
      },
      signal: AbortSignal.timeout(CLARITY_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new ClarityApiError(0, "Microsoft Clarity Data Export timed out.");
    }
    throw new ClarityApiError(
      0,
      "Microsoft Clarity Data Export is temporarily unavailable.",
    );
  }

  if (!response.ok) {
    throw new ClarityApiError(
      response.status,
      messageForStatus(response.status),
      safeRetryAfter(response),
    );
  }

  try {
    const body = await response.text();
    if (
      new TextEncoder().encode(body).length >
      CLARITY_MAX_PROVIDER_RESPONSE_BYTES
    ) {
      throw new ClarityMalformedResponseError();
    }
    return parseClarityResponse(JSON.parse(body) as unknown);
  } catch (error) {
    if (error instanceof ClarityMalformedResponseError) throw error;
    throw new ClarityMalformedResponseError();
  }
}
