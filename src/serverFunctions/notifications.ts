import { createServerFn } from "@tanstack/react-start";
import { NotificationService } from "@/server/features/notifications/services/NotificationService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createNotificationChannelSchema,
  createRankNotificationRuleSchema,
  deleteNotificationChannelSchema,
  deleteNotificationRuleSchema,
  notificationProjectSchema,
  testNotificationChannelSchema,
  testSampleRankNotificationSchema,
  updateNotificationRuleSchema,
} from "@/types/schemas/notifications";

export const getNotificationSetup = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(notificationProjectSchema)
  .handler(async ({ context }) => NotificationService.getSetup(context));

export const createNotificationChannel = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createNotificationChannelSchema)
  .handler(async ({ data, context }) =>
    NotificationService.createChannel(context, data),
  );

export const deleteNotificationChannel = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(deleteNotificationChannelSchema)
  .handler(async ({ data, context }) =>
    NotificationService.deleteChannel(context, data),
  );

export const testNotificationChannel = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(testNotificationChannelSchema)
  .handler(async ({ data, context }) =>
    NotificationService.testChannel(context, data),
  );

export const testSampleRankNotification = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(testSampleRankNotificationSchema)
  .handler(async ({ data, context }) =>
    NotificationService.testSampleRankAlert(context, data),
  );

export const createRankNotificationRule = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createRankNotificationRuleSchema)
  .handler(async ({ data, context }) =>
    NotificationService.createRankRule(context, data),
  );

export const updateNotificationRule = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateNotificationRuleSchema)
  .handler(async ({ data, context }) =>
    NotificationService.updateRule(context, data),
  );

export const deleteNotificationRule = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(deleteNotificationRuleSchema)
  .handler(async ({ data, context }) =>
    NotificationService.deleteRule(context, data),
  );
