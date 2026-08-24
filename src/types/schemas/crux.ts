import { z } from "zod";

const cruxFormFactorSchema = z.enum(["PHONE", "DESKTOP", "TABLET"]);

export const cruxProjectInputSchema = z.object({
  projectId: z.string().min(1),
  /** Page-level query. When omitted, origin-level data for the project's
   *  domain is returned. */
  url: z.string().url().optional(),
  formFactor: cruxFormFactorSchema.default("PHONE"),
});

const cruxMetricSnapshotSchema = z
  .object({
    p75: z.number(),
    good: z.number(),
    needsImprovement: z.number(),
    poor: z.number(),
  })
  .nullable();

export const cruxSnapshotRecordSchema = z.object({
  lcpMs: cruxMetricSnapshotSchema,
  inpMs: cruxMetricSnapshotSchema,
  cls: cruxMetricSnapshotSchema,
  ttfbMs: cruxMetricSnapshotSchema,
  collectionPeriod: z
    .object({ firstDate: z.string(), lastDate: z.string() })
    .nullable(),
});

export const cruxWeeklyRowSchema = z.object({
  weekEnd: z.string(),
  lcpMs: z.number().nullable(),
  inpMs: z.number().nullable(),
  cls: z.number().nullable(),
});

/** Shaped snapshot stored in the R2 cache; reads are safeParse-validated so
 *  schema drift between writes and reads surfaces as a cache miss. */
export const cruxSnapshotSchema = z.object({
  record: cruxSnapshotRecordSchema,
  history: z.array(cruxWeeklyRowSchema),
  fetchedAt: z.string(),
});

export type CruxSnapshotRecord = z.infer<typeof cruxSnapshotRecordSchema>;
export type CruxWeeklyRow = z.infer<typeof cruxWeeklyRowSchema>;
export type CruxSnapshot = z.infer<typeof cruxSnapshotSchema>;
