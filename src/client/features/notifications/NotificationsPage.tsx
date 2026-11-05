import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { NotificationsChannelsSection } from "@/client/features/notifications/NotificationsChannelsSection";
import { NotificationsRulesSection } from "@/client/features/notifications/NotificationsRulesSection";
import { useNotificationsPage } from "@/client/features/notifications/useNotificationsPage";

export function NotificationsPage({ projectId }: { projectId: string }) {
  const page = useNotificationsPage(projectId);

  if (page.setupQuery.isError) {
    return (
      <QueryError
        error={page.setupQuery.error}
        onRetry={page.setupQuery.refetch}
      />
    );
  }

  const setup = page.setupQuery.data;
  const channels = setup?.channels ?? [];
  const rules = setup?.rules ?? [];
  const trackers = page.trackersQuery.data ?? [];

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground text-sm">
        Connect Slack or Microsoft Teams, then create rules that post to a
        channel when rank positions move. Webhook URLs are encrypted and never
        shown again after you save them. Microsoft Teams rank alerts use an
        Adaptive Card layout; use{" "}
        <strong className="font-medium">Sample rank alert</strong> to preview
        formatting, or <strong className="font-medium">Preview rule</strong> on
        a saved rule to match its settings.
      </p>

      {!setup?.canStoreWebhooks && (
        <CardShell title="Encryption not configured">
          <p className="text-sm">
            Set <code className="text-xs">BETTER_AUTH_SECRET</code> (32+
            characters) so OpenSEO can store webhook URLs securely.
          </p>
        </CardShell>
      )}

      <NotificationsChannelsSection
        canStoreWebhooks={setup?.canStoreWebhooks ?? false}
        channels={channels}
        page={page}
      />

      <NotificationsRulesSection
        channels={channels}
        rules={rules}
        trackers={trackers}
        page={page}
      />
    </div>
  );
}
