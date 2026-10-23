import { z } from "zod";

export const googleMapsViewportSchema = z
  .object({
    zoom: z.number().int().min(0).max(22),
    north: z.number().min(-85.0511287798).max(85.0511287798),
    south: z.number().min(-85.0511287798).max(85.0511287798),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  })
  .refine((viewport) => viewport.north >= viewport.south);

export type GoogleMapsViewport = z.infer<typeof googleMapsViewportSchema>;
