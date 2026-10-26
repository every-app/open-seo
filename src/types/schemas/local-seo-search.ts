import { z } from "zod";

export const localSeoSearchSchema = z.object({
  view: z.literal("history").optional().catch(undefined),
  keyword: z.uuid().optional(),
  scan: z.uuid().optional(),
  point: z.uuid().optional(),
});
export type LocalSeoSearch = z.infer<typeof localSeoSearchSchema>;
