import { Trash2 } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
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
import type { NotificationsPageController } from "@/client/features/notifications/useNotificationsPage";
import type { NotificationChannelSummary } from "@/types/schemas/notifications";

export function NotificationsChannelsSection({
  canStoreWebhooks,
  channels,
  page,
}: {
  canStoreWebhooks: boolean;
  channels: NotificationChannelSummary[];
  page: NotificationsPageController;
}) {
  const {
    projectId,
    channelForm,
    createChannelMutation,
    testChannelMutation,
    testSampleRankMutation,
    deleteChannelMutation,
  } = page;

  return (
    <>
      <CardShell title="Connect a channel">
        <channelForm.Subscribe selector={(state) => state}>
          {(state) => (
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
                      disabled={!canStoreWebhooks}
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
                      disabled={!canStoreWebhooks}
                    >
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="teams">Microsoft Teams</SelectItem>
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
                      disabled={!canStoreWebhooks}
                    />
                  </div>
                )}
              </channelForm.Field>

              <Button
                type="submit"
                disabled={
                  !canStoreWebhooks ||
                  state.isSubmitting ||
                  createChannelMutation.isPending
                }
              >
                Save channel
              </Button>
            </form>
          )}
        </channelForm.Subscribe>
      </CardShell>

      {channels.length > 0 && (
        <CardShell title="Connected channels">
          <ul className="divide-y">
            {channels.map((channel) => (
              <li
                key={channel.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{channel.name}</p>
                  <p
                    className="text-muted-foreground max-w-[14rem] truncate text-sm sm:max-w-xs"
                    title={`${channel.provider === "slack" ? "Slack" : "Teams"} · ${channel.webhookHost}`}
                  >
                    {channel.provider === "slack" ? "Slack" : "Teams"} ·{" "}
                    {channel.webhookHost}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
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
                    variant="outline"
                    size="sm"
                    disabled={testSampleRankMutation.isPending}
                    onClick={() =>
                      testSampleRankMutation.mutate({
                        data: { projectId, channelId: channel.id },
                      })
                    }
                  >
                    Sample rank alert
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
    </>
  );
}
