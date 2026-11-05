import { z } from "zod";
import {
  rankPositionChangeDirectionSchema,
  type NotificationRuleSummary,
} from "@/types/schemas/notifications";

export const channelSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  provider: z.enum(["slack", "teams"]),
  webhookUrl: z.string().trim().url("Enter a valid webhook URL."),
});

export const ruleSchema = z.object({
  channelId: z.string().min(1, "Choose a channel."),
  rankConfigId: z.string(),
  positionThreshold: z.coerce.number().int().min(1).max(100),
  positionChangeDirection: rankPositionChangeDirectionSchema,
  weeklySummary: z.boolean(),
});

export type RuleFormValues = z.infer<typeof ruleSchema>;

export const defaultRuleValues: RuleFormValues = {
  channelId: "",
  rankConfigId: "all",
  positionThreshold: 3,
  positionChangeDirection: "either",
  weeklySummary: false,
};

export function ruleToFormValues(
  rule: NotificationRuleSummary,
): RuleFormValues {
  return {
    channelId: rule.channelId,
    rankConfigId: rule.rankConfigId ?? "all",
    positionThreshold: rule.positionThreshold,
    positionChangeDirection: rule.positionChangeDirection,
    weeklySummary: rule.weeklySummary,
  };
}
