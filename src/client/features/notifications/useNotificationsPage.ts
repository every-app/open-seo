import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import {
  createNotificationChannel,
  createRankNotificationRule,
  deleteNotificationChannel,
  deleteNotificationRule,
  getNotificationSetup,
  testNotificationChannel,
  testSampleRankNotification,
  updateNotificationRule,
} from "@/serverFunctions/notifications";
import { getRankTrackingConfigSummaries } from "@/serverFunctions/rank-tracking";
import type { NotificationRuleSummary } from "@/types/schemas/notifications";
import {
  channelSchema,
  defaultRuleValues,
  ruleSchema,
  ruleToFormValues,
} from "@/client/features/notifications/notificationsPageSchemas";

export function useNotificationsPage(projectId: string) {
  const queryClient = useQueryClient();
  const setupKey = ["notifications-setup", projectId];
  const trackersKey = ["rankTrackingConfigSummaries", projectId];
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const setupQuery = useQuery({
    queryKey: setupKey,
    queryFn: () => getNotificationSetup({ data: { projectId } }),
  });

  const trackersQuery = useQuery({
    queryKey: trackersKey,
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: setupKey });
  };

  const createChannelMutation = useMutation({
    mutationFn: createNotificationChannel,
    onSuccess: () => {
      toast.success("Channel connected");
      channelForm.reset();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testChannelMutation = useMutation({
    mutationFn: testNotificationChannel,
    onSuccess: () => toast.success("Test message sent"),
    onError: (error: Error) => toast.error(error.message),
  });

  const testSampleRankMutation = useMutation({
    mutationFn: testSampleRankNotification,
    onSuccess: () => toast.success("Sample rank alert sent"),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteChannelMutation = useMutation({
    mutationFn: deleteNotificationChannel,
    onSuccess: () => {
      toast.success("Channel removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createRuleMutation = useMutation({
    mutationFn: createRankNotificationRule,
    onSuccess: () => {
      toast.success("Alert rule created");
      ruleForm.reset(defaultRuleValues);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRuleMutation = useMutation({
    mutationFn: updateNotificationRule,
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const saveRuleMutation = useMutation({
    mutationFn: updateNotificationRule,
    onSuccess: () => {
      toast.success("Alert rule saved");
      setEditingRuleId(null);
      ruleForm.reset(defaultRuleValues);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: deleteNotificationRule,
    onSuccess: () => {
      toast.success("Rule removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const channelForm = useAppForm({
    defaultValues: {
      name: "",
      provider: "slack" as const,
      webhookUrl: "",
    },
    validators: { onDynamic: revalidateLogic({ mode: "blur" }) },
    onSubmit: async ({ value }) => {
      const parsed = channelSchema.safeParse(value);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
        return;
      }
      await createChannelMutation.mutateAsync({
        data: { projectId, ...parsed.data },
      });
    },
  });

  const ruleForm = useAppForm({
    defaultValues: defaultRuleValues,
    validators: { onDynamic: revalidateLogic({ mode: "blur" }) },
    onSubmit: async ({ value }) => {
      const parsed = ruleSchema.safeParse(value);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
        return;
      }
      const rankConfigId =
        parsed.data.rankConfigId === "all" ? null : parsed.data.rankConfigId;
      const payload = {
        projectId,
        channelId: parsed.data.channelId,
        rankConfigId,
        positionThreshold: parsed.data.positionThreshold,
        positionChangeDirection: parsed.data.positionChangeDirection,
        weeklySummary: parsed.data.weeklySummary,
      };

      if (editingRuleId) {
        await saveRuleMutation.mutateAsync({
          data: { ...payload, ruleId: editingRuleId },
        });
      } else {
        await createRuleMutation.mutateAsync({ data: payload });
      }
    },
  });

  const startEditingRule = (rule: NotificationRuleSummary) => {
    setEditingRuleId(rule.id);
    ruleForm.reset(ruleToFormValues(rule));
  };

  const cancelEditingRule = () => {
    setEditingRuleId(null);
    ruleForm.reset(defaultRuleValues);
  };

  return {
    projectId,
    setupQuery,
    trackersQuery,
    editingRuleId,
    channelForm,
    ruleForm,
    createChannelMutation,
    testChannelMutation,
    testSampleRankMutation,
    deleteChannelMutation,
    createRuleMutation,
    saveRuleMutation,
    updateRuleMutation,
    deleteRuleMutation,
    startEditingRule,
    cancelEditingRule,
  };
}

export type NotificationsPageController = ReturnType<
  typeof useNotificationsPage
>;
