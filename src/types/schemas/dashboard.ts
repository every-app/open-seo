import { z } from "zod";

export const dashboardProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const dashboardSetupStepSchema = z.enum([
  "competitor",
  "keywords",
  "audit",
  "mcp",
  "team",
  "project",
]);
export type DashboardSetupStep = z.infer<typeof dashboardSetupStepSchema>;
// Steps that complete when the workspace first runs that research, from the
// app or an agent.
export type DashboardResearchStep = Extract<
  DashboardSetupStep,
  "competitor" | "keywords"
>;
export const dashboardStepDismissalSchema = dashboardProjectInputSchema.extend({
  step: dashboardSetupStepSchema,
  dismissed: z.boolean(),
});

export const dashboardSiteTabSchema = z.enum([
  "overview",
  "keywords",
  "backlinks",
]);
export const dashboardSearchSchema = z.object({
  tab: dashboardSiteTabSchema.optional().catch(undefined),
});
export const dashboardBacklinksInputSchema = dashboardProjectInputSchema.extend(
  { kind: z.enum(["new", "lost", "all"]).default("new") },
);
