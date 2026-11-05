import { Pencil, Trash2 } from "lucide-react";
import { z } from "zod";
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
import { Switch } from "@/client/components/ui/switch";
import {
  RankTrackerLocationBadge,
  RankTrackerSelectLabel,
} from "@/client/features/notifications/RankTrackerLocationBadge";
import type { NotificationsPageController } from "@/client/features/notifications/useNotificationsPage";
import { rankDirectionLabel } from "@/shared/rank-notification-direction";
import {
  rankPositionChangeDirectionSchema,
  type NotificationChannelSummary,
  type NotificationRuleSummary,
} from "@/types/schemas/notifications";
import type { getRankTrackingConfigSummaries } from "@/serverFunctions/rank-tracking";

type TrackerSummary = Awaited<
  ReturnType<typeof getRankTrackingConfigSummaries>
>[number];

export function NotificationsRulesSection({
  channels,
  rules,
  trackers,
  page,
}: {
  channels: NotificationChannelSummary[];
  rules: NotificationRuleSummary[];
  trackers: TrackerSummary[];
  page: NotificationsPageController;
}) {
  const {
    projectId,
    editingRuleId,
    ruleForm,
    createRuleMutation,
    saveRuleMutation,
    updateRuleMutation,
    deleteRuleMutation,
    testSampleRankMutation,
    startEditingRule,
    cancelEditingRule,
  } = page;

  const trackerById = new Map(trackers.map((tracker) => [tracker.id, tracker]));

  return (
    <CardShell title="Rank tracking alerts">
      {channels.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Connect a channel before creating rules.
        </p>
      ) : (
        <>
          <ruleForm.Subscribe selector={(state) => state}>
            {(state) => (
              <form
                className="mb-6 space-y-4 border-b pb-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void ruleForm.handleSubmit();
                }}
              >
                {editingRuleId ? (
                  <p className="text-sm font-medium">Edit alert rule</p>
                ) : null}

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
                              <RankTrackerSelectLabel
                                domain={tracker.domain}
                                locationCode={tracker.locationCode}
                                locationName={tracker.locationName}
                              />
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

                <ruleForm.Field name="positionChangeDirection">
                  {(field) => (
                    <div className="space-y-2">
                      <Label>Which moves count</Label>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(
                            value as z.infer<
                              typeof rankPositionChangeDirectionSchema
                            >,
                          )
                        }
                      >
                        <SelectTrigger className="w-full max-w-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {rankPositionChangeDirectionSchema.options.map(
                            (option) => (
                              <SelectItem key={option} value={option}>
                                {rankDirectionLabel(option)}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
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

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={
                      state.isSubmitting ||
                      createRuleMutation.isPending ||
                      saveRuleMutation.isPending
                    }
                  >
                    {editingRuleId ? "Save rule" : "Add rule"}
                  </Button>
                  {editingRuleId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelEditingRule}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            )}
          </ruleForm.Subscribe>

          {rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rules yet.</p>
          ) : (
            <ul className="divide-y">
              {rules.map((rule) => {
                const tracker =
                  rule.rankConfigId != null
                    ? trackerById.get(rule.rankConfigId)
                    : undefined;
                return (
                  <li key={rule.id} className="space-y-3 py-4 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          <span>
                            {rule.rankConfigDomain ?? "All rank trackers"}
                          </span>
                          {tracker ? (
                            <RankTrackerLocationBadge
                              locationCode={tracker.locationCode}
                              locationName={tracker.locationName}
                            />
                          ) : null}
                          <span className="text-muted-foreground font-normal">
                            → {rule.channelName}
                          </span>
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Move ≥ {rule.positionThreshold} positions
                          {rule.positionChangeDirection !== "either"
                            ? ` · ${rankDirectionLabel(rule.positionChangeDirection)}`
                            : ""}
                          {rule.weeklySummary ? " · weekly summary" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={testSampleRankMutation.isPending}
                          onClick={() =>
                            testSampleRankMutation.mutate({
                              data: {
                                projectId,
                                channelId: rule.channelId,
                                ruleId: rule.id,
                              },
                            })
                          }
                        >
                          Preview rule
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditingRule(rule)}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
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
                );
              })}
            </ul>
          )}
        </>
      )}
    </CardShell>
  );
}
