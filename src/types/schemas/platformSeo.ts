import { z } from "zod";

const projectIdSchema = z.string().min(1);

export const psProjectSchema = z.object({ projectId: projectIdSchema });

export const psStartPullSchema = z.object({
  projectId: projectIdSchema,
  seed: z.string().trim().min(2).max(120),
  seedMeaning: z.string().trim().max(300).optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const psPullSchema = z.object({
  projectId: projectIdSchema,
  pullId: z.string().min(1),
});

export const psCreateTopicSchema = z.object({
  projectId: projectIdSchema,
  clusterId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
});
