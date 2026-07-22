import { z } from "zod";

export const dashboardHeroStepSchema = z.enum([
  "domain",
  "mcp",
  "gsc",
  "competitor",
]);
export type DashboardHeroStep = z.infer<typeof dashboardHeroStepSchema>;

export const dashboardProjectInputSchema = z.object({
  projectId: z.string().min(1),
});
