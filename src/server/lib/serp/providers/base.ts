import { z } from "zod";

// ---------------------------------------------------------------------------
// SerpLiveItem schema / type — shared between dataforseo and external providers
// so every consumer reads the same shape regardless of source.
// ---------------------------------------------------------------------------

export const serpSnapshotItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    etv: z.number().nullable().optional(),
    estimated_paid_traffic_cost: z.number().nullable().optional(),
    backlinks_info: z
      .object({
        referring_domains: z.number().nullable().optional(),
        backlinks: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

/** The single row shape returned by every SERP provider. */
export type SerpLiveItem = z.infer<typeof serpSnapshotItemSchema>;

/** Input accepted by every provider's liveSerp method. */
export interface SerpLiveInput {
  keyword: string;
  locationCode?: number;
  languageCode?: string;
}

/** Provider contract — each implementation returns items in this normalised shape. */
export interface SerpProvider {
  /** Human-friendly name used in logs. */
  name: string;
  /** Fetch live organic SERP entries for the given keyword/location/language. */
  liveSerp(input: SerpLiveInput): Promise<SerpLiveItem[]>;
}
