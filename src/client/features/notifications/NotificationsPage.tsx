import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Switch } from "@/client/components/ui/switch";
import {
  createNotificationChannel,
  createRankNotificationRule,
  deleteNotificationChannel,
  deleteNotificationRule,
  getNotificationSetup,
  testNotificationChannel,
  updateNotificationRule,
} from "@/serverFunctions/notifications";
import { getRankTrackingConfigSummaries } from "@/serverFunctions/rank-tracking";

const channelSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  provider: z.enum(["slack", "teams"]),
  webhookUrl: z.string().trim().url("Enter a valid webhook URL."),
});

const ruleSchema = z.object({
  channelId: z.string().min(1, "Choose a channel."),
  rankConfigId: z.string(),
  positionThreshold: z.coerce.number().int().min(1).max(100),
  weeklySummary: z.boolean(),
});

export function NotificationsPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const setupKey = ["notifications-setup", projectId];
  const trackersKey = ["rankTrackingConfigSummaries", projectId];

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
      ruleForm.reset();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRuleMutation = useMutation({
    mutationFn: updateNotificationRule,
    onSuccess: invalidate,
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
    defaultValues: {
      channelId: "",
      rankConfigId: "all",
      positionThreshold: 3,
      weeklySummary: false,
    },
    validators: { onDynamic: revalidateLogic({ mode: "blur" }) },
    onSubmit: async ({ value }) => {
      const parsed = ruleSchema.safeParse(value);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
        return;
      }
      await createRuleMutation.mutateAsync({
        data: {
          projectId,
          channelId: parsed.data.channelId,
          rankConfigId:
            parsed.data.rankConfigId === "all"
              ? null
              : parsed.data.rankConfigId,
          positionThreshold: parsed.data.positionThreshold,
          weeklySummary: parsed.data.weeklySummary,
        },
      });
    },
  });

  if (setupQuery.isError) {
    return <QueryError error={setupQuery.error} onRetry={setupQuery.refetch} />;
  }

  const setup = setupQuery.data;
  const channels = setup?.channels ?? [];
  const rules = setup?.rules ?? [];
  const trackers = trackersQuery.data ?? [];

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground text-sm">
        Connect Slack or Microsoft Teams, then create rules that post to a
        channel when rank positions move. Webhook URLs are encrypted and never
        shown again after you save them.
      </p>

      {!setup?.canStoreWebhooks && (
        <CardShell title="Encryption not configured">
          <p className="text-sm">
            Set{" "}
            <code className="text-xs">BETTER_AUTH_SECRET</code> (32+ characters)
            so OpenSEO can store webhook URLs securely.
          </p>
        </CardShell>
      )}

      <CardShell title="Connect a channel">
        <channelForm.Subscribe
          selector={(state) => state}
          children={(state) => (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void channelForm.handleSubmit();
              }}
            >
              <channelForm.Field name="name">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="channel-name">Name</Label>
                    <Input
                      id="channel-name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="SEO alerts"
                      disabled={!setup?.canStoreWebhooks}
                    />
                  </div>
                )}
              </channelForm.Field>

              <channelForm.Field name="provider">
                {(field) => (
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as "slack" | "teams")
                      }
                      disabled={!setup?.canStoreWebhooks}
                    >
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="teams">
                          Microsoft Teams
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </channelForm.Field>

              <channelForm.Field name="webhookUrl">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">Incoming webhook URL</Label>
                    <Input
                      id="webhook-url"
                      type="url"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="https://hooks.slack.com/services/…"
                      disabled={!setup?.canStoreWebhooks}
                    />
                  </div>
                )}
              </channelForm.Field>

              <Button
                type="submit"
                disabled={
                  !setup?.canStoreWebhooks ||
                  state.isSubmitting ||
                  createChannelMutation.isPending
                }
              >
                Save channel
              </Button>
            </form>
          )}
        />
      </CardShell>

      {channels.length > 0 && (
        <CardShell title="Connected channels">
          <ul className="divide-y">
            {channels.map((channel) => (
              <li
                key={channel.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{channel.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {channel.provider === "slack" ? "Slack" : "Teams"} ·{" "}
                    {channel.webhookHost}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testChannelMutation.isPending}
                    onClick={() =>
                      testChannelMutation.mutate({
                        data: { projectId, channelId: channel.id },
                      })
                    }
                  >
                    Send test
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      deleteChannelMutation.mutate({
                        data: { projectId, channelId: channel.id },
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardShell>
      )}

      <CardShell title="Rank tracking alerts">
        {channels.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Connect a channel before creating rules.
          </p>
        ) : (
          <>
            <ruleForm.Subscribe
              selector={(state) => state}
              children={(state) => (
                <form
                  className="mb-6 space-y-4 border-b pb-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void ruleForm.handleSubmit();
                  }}
                >
                  <ruleForm.Field name="channelId">
                    {(field) => (
                      <div className="space-y-2">
                        <Label>Post to</Label>
                        <Select
                          value={field.state.value}
                          onValueChange={field.handleChange}
                        >
                          <SelectTrigger className="w-full max-w-md">
                            <SelectValue placeholder="Choose channel" />
                          </SelectTrigger>
                          <SelectContent>
                            {channels.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                {channel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </ruleForm.Field>

                  <ruleForm.Field name="rankConfigId">
                    {(field) => (
                      <div className="space-y-2">
                        <Label>Rank tracker</Label>
                        <Select
                          value={field.state.value}
                          onValueChange={field.handleChange}
                        >
                          <SelectTrigger className="w-full max-w-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All trackers</SelectItem>
                            {trackers.map((tracker) => (
                              <SelectItem key={tracker.id} value={tracker.id}>
                                {tracker.domain}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </ruleForm.Field>

                  <ruleForm.Field name="positionThreshold">
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor="threshold">
                          Alert when position changes by at least
                        </Label>
                        <Input
                          id="threshold"
                          type="number"
                          min={1}
                          max={100}
                          className="max-w-[8rem]"
                          value={field.state.value}
                          onChange={(e) =>
                            field.handleChange(Number(e.target.value))
                          }
                        />
                      </div>
                    )}
                  </ruleForm.Field>

                  <ruleForm.Field name="weeklySummary">
                    {(field) => (
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={field.state.value}
                          onCheckedChange={field.handleChange}
                          id="weekly-summary"
                        />
                        <Label htmlFor="weekly-summary">
                          Also send a short message after each weekly scheduled
                          check (even when nothing crossed the threshold)
                        </Label>
                      </div>
                    )}
                  </ruleForm.Field>

                  <Button
                    type="submit"
                    disabled={
                      state.isSubmitting || createRuleMutation.isPending
                    }
                  >
                    Add rule
                  </Button>
                </form>
              )}
            />

            {rules.length === 0 ? (
              <p className="text-muted-foreground text-sm">No rules yet.</p>
            ) : (
              <ul className="divide-y">
                {rules.map((rule) => (
                  <li key={rule.id} className="space-y-3 py-4 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {rule.rankConfigDomain ?? "All rank trackers"} →{" "}
                          {rule.channelName}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Move ≥ {rule.positionThreshold} positions
                          {rule.weeklySummary ? " · weekly summary" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(enabled) =>
                            updateRuleMutation.mutate({
                              data: { projectId, ruleId: rule.id, enabled },
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            deleteRuleMutation.mutate({
                              data: { projectId, ruleId: rule.id },
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardShell>
    </div>
  );
}
