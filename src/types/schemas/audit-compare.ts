import { z } from "zod";

export const compareLatestAuditsSchema = z.object({
  projectId: z.string().min(1),
});
