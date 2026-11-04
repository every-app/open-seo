import { z } from "zod";

export const notificationProviderSchema = z.enum(["slack", "teams"]);

export const notificationProjectSchema = z.object({
  projectId: z.string().min(1),
});

export const createNotificationChannelSchema = notificationProjectSchema.extend({
  name: z.string().trim().min(1).max(80),
  provider: notificationProviderSchema,
  webhookUrl: z.string().trim().url().max(2048),
});

export const deleteNotificationChannelSchema = notificationProjectSchema.extend({
  channelId: z.string().min(1),
});

export const testNotificationChannelSchema = deleteNotificationChannelSchema;

export const createRankNotificationRuleSchema =
  notificationProjectSchema.extend({
    channelId: z.string().min(1),
    rankConfigId: z.string().min(1).nullable(),
    positionThreshold: z.number().int().min(1).max(100),
    weeklySummary: z.boolean(),
  });

export const updateNotificationRuleSchema = notificationProjectSchema.extend({
  ruleId: z.string().min(1),
  enabled: z.boolean().optional(),
  positionThreshold: z.number().int().min(1).max(100).optional(),
  weeklySummary: z.boolean().optional(),
});

export const deleteNotificationRuleSchema = notificationProjectSchema.extend({
  ruleId: z.string().min(1),
});

export type NotificationProvider = z.infer<typeof notificationProviderSchema>;

export type NotificationChannelSummary = {
  id: string;
  name: string;
  provider: NotificationProvider;
  webhookHost: string;
  createdAt: string;
};

export type NotificationRuleSummary = {
  id: string;
  channelId: string;
  channelName: string;
  provider: NotificationProvider;
  ruleType: "rank_position_change";
  rankConfigId: string | null;
  rankConfigDomain: string | null;
  positionThreshold: number;
  weeklySummary: boolean;
  enabled: boolean;
  createdAt: string;
};
