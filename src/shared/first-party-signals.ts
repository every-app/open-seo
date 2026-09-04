import { z } from "zod";

export const FIRST_PARTY_MAX_BODY_BYTES = 256 * 1024;
const FIRST_PARTY_MAX_ROWS = 1_000;
export const FIRST_PARTY_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1_000;
export const FIRST_PARTY_RETENTION_DAYS = 400;

/** Oldest UTC snapshot date retained when today counts as the first day. */
export function firstPartyOldestRetainedSnapshotDate(now: Date): string {
  const oldest = new Date(now);
  oldest.setUTCDate(oldest.getUTCDate() - (FIRST_PARTY_RETENTION_DAYS - 1));
  return oldest.toISOString().slice(0, 10);
}

const counterSchema = z.number().int().min(0).max(2_147_483_647);

const firstPartyAggregateRowSchema = z
  .object({
    landingPath: z.string().min(1).max(1_024),
    searchStarted: counterSchema,
    searchCompleted: counterSchema,
    searchNoResults: counterSchema,
    registrationsCompleted: counterSchema,
    checkoutStarted: counterSchema,
    paymentsCompleted: counterSchema,
  })
  .strict();

export const firstPartyAggregateSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    batchId: z.string().uuid(),
    snapshotDate: z.string().date(),
    rows: z.array(firstPartyAggregateRowSchema).max(FIRST_PARTY_MAX_ROWS),
  })
  .strict();

export type FirstPartyAggregateSnapshot = z.infer<
  typeof firstPartyAggregateSnapshotSchema
>;

export const firstPartyFunnelTotalsSchema = z.object({
  searchStarted: z.number(),
  searchCompleted: z.number(),
  searchNoResults: z.number(),
  registrationsCompleted: z.number(),
  checkoutStarted: z.number(),
  paymentsCompleted: z.number(),
});

export const firstPartyConversionRatesSchema = z.object({
  searchCompletionRate: z.number().nullable(),
  noResultRate: z.number().nullable(),
  registrationPerSearchRate: z.number().nullable(),
  checkoutPerSearchRate: z.number().nullable(),
  paymentPerCheckoutRate: z.number().nullable(),
});
