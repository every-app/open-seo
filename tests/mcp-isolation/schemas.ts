import { z } from "zod";

// Only the fields the suite asserts on; every tool returns more.

const idSchema = z.looseObject({ id: z.string() });

export const projectsSchema = z.looseObject({ projects: z.array(idSchema) });
export const createdProjectSchema = z.looseObject({ project: idSchema });
export const whoamiSchema = z.looseObject({ userEmail: z.string() });
export const savedKeywordsSchema = z.looseObject({
  rows: z.array(z.looseObject({ id: z.string(), keyword: z.string() })),
});
export const reportsSchema = z.looseObject({ reports: z.array(idSchema) });
export const reportSchema = z.looseObject({
  report: z.looseObject({ shareUrl: z.string().nullable() }),
});
export const savedReportSchema = z.looseObject({ reportId: z.string() });
export const templatesSchema = z.looseObject({ templates: z.array(idSchema) });
export const savedTemplateSchema = z.looseObject({ templateId: z.string() });
export const deletedCountSchema = z.looseObject({ deletedCount: z.number() });
