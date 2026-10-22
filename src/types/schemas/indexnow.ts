import { z } from "zod";

// IndexNow accepts up to 10,000 URLs per request.
export const indexNowUrlsSchema = z
  .array(z.string().max(2048))
  .min(1)
  .max(10_000);

export const indexNowProjectSchema = z.object({ projectId: z.string().min(1) });

export const submitIndexNowUrlsSchema = z.object({
  projectId: z.string().min(1),
  urls: indexNowUrlsSchema,
});
