import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { NotificationRepository } from "@/server/features/notifications/repositories/NotificationRepository";
import { validateNotificationWebhookUrl } from "@/server/features/notifications/validateWebhookUrl";
import {
  canStoreNotificationWebhooks,
  openWebhookUrl,
  sealWebhookUrl,
} from "@/server/features/notifications/webhookSecrets";
import { postNotificationWebhook } from "@/server/features/notifications/webhookDelivery";
import { AppError } from "@/server/lib/errors";
import type {
  NotificationChannelSummary,
  NotificationRuleSummary,
} from "@/types/schemas/notifications";

type ProjectContext = { projectId: string };

function toChannelSummary(
  row: Awaited<
    ReturnType<typeof NotificationRepository.listChannelsForProject>
  >[number],
): NotificationChannelSummary {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    webhookHost: row.webhookHost,
    createdAt: row.createdAt,
  };
}

function toRuleSummary(
  row: Awaited<ReturnType<typeof NotificationRepository.listRulesForProject>>[number],
): NotificationRuleSummary {
  return {
    id: row.rule.id,
    channelId: row.rule.channelId,
    channelName: row.channel.name,
    provider: row.channel.provider,
    ruleType: row.rule.ruleType,
    rankConfigId: row.rule.rankConfigId,
    rankConfigDomain: row.config?.domain ?? null,
    positionThreshold: row.rule.positionThreshold,
    weeklySummary: row.rule.weeklySummary,
    enabled: row.rule.enabled,
    createdAt: row.rule.createdAt,
  };
}

async function assertRankConfigInProject(input: {
  projectId: string;
  rankConfigId: string | null;
}) {
  if (!input.rankConfigId) return;
  const config = await RankTrackingRepository.getConfigById({
    configId: input.rankConfigId,
    projectId: input.projectId,
  });
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracker not found in this project.");
  }
}

export const NotificationService = {
  async getSetup(context: ProjectContext) {
    return {
      canStoreWebhooks: await canStoreNotificationWebhooks(),
      channels: (
        await NotificationRepository.listChannelsForProject(context.projectId)
      ).map(toChannelSummary),
      rules: (
        await NotificationRepository.listRulesForProject(context.projectId)
      ).map(toRuleSummary),
    };
  },

  async createChannel(
    context: ProjectContext,
    input: {
      name: string;
      provider: "slack" | "teams";
      webhookUrl: string;
    },
  ) {
    const url = validateNotificationWebhookUrl(input.webhookUrl);
    const ciphertext = await sealWebhookUrl(url.href);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await NotificationRepository.insertChannel({
      id,
      projectId: context.projectId,
      name: input.name.trim(),
      provider: input.provider,
      webhookCiphertext: ciphertext,
      webhookHost: url.hostname,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },

  async deleteChannel(
    context: ProjectContext,
    input: { channelId: string },
  ) {
    await NotificationRepository.deleteChannel({
      projectId: context.projectId,
      channelId: input.channelId,
    });
  },

  async testChannel(context: ProjectContext, input: { channelId: string }) {
    const channel = await NotificationRepository.getChannelForProject({
      projectId: context.projectId,
      channelId: input.channelId,
    });
    if (!channel) {
      throw new AppError("INTERNAL_ERROR", "Notification channel not found.");
    }
    const webhookUrl = await openWebhookUrl(channel.webhookCiphertext);
    await postNotificationWebhook({
      provider: channel.provider,
      webhookUrl,
      text: "OpenSEO test notification — your webhook is connected.",
    });
  },

  async createRankRule(
    context: ProjectContext,
    input: {
      channelId: string;
      rankConfigId: string | null;
      positionThreshold: number;
      weeklySummary: boolean;
    },
  ) {
    const channel = await NotificationRepository.getChannelForProject({
      projectId: context.projectId,
      channelId: input.channelId,
    });
    if (!channel) {
      throw new AppError("INTERNAL_ERROR", "Notification channel not found.");
    }
    await assertRankConfigInProject({
      projectId: context.projectId,
      rankConfigId: input.rankConfigId,
    });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await NotificationRepository.insertRule({
      id,
      projectId: context.projectId,
      channelId: input.channelId,
      ruleType: "rank_position_change",
      rankConfigId: input.rankConfigId,
      positionThreshold: input.positionThreshold,
      weeklySummary: input.weeklySummary,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },

  async updateRule(
    context: ProjectContext,
    input: {
      ruleId: string;
      enabled?: boolean;
      positionThreshold?: number;
      weeklySummary?: boolean;
    },
  ) {
    await NotificationRepository.updateRule({
      projectId: context.projectId,
      ruleId: input.ruleId,
      patch: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.positionThreshold !== undefined
          ? { positionThreshold: input.positionThreshold }
          : {}),
        ...(input.weeklySummary !== undefined
          ? { weeklySummary: input.weeklySummary }
          : {}),
      },
    });
  },

  async deleteRule(context: ProjectContext, input: { ruleId: string }) {
    await NotificationRepository.deleteRule({
      projectId: context.projectId,
      ruleId: input.ruleId,
    });
  },
};
