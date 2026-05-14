import { z } from "zod";

const mcpMetaOutputSchema = z
  .object({
    url: z.string().optional(),
    organizationId: z.string().optional(),
    projectId: z.string().optional(),
    runId: z.string().optional(),
    creditsCharged: z.number().optional(),
    creditsRemaining: z.number().optional(),
  })
  .passthrough();

export const looseObjectOutputSchema = z.record(z.string(), z.unknown());

export const optionalMetaOutputSchema = {
  meta: mcpMetaOutputSchema.optional(),
} as const;
