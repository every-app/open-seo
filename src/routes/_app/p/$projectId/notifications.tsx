import { createFileRoute } from "@tanstack/react-router";
import { queryClient } from "@/client/tanstack-db/queryClient";
import { ProjectPageHeader } from "@/client/features/projects/ProjectPageHeader";
import { NotificationsPage } from "@/client/features/notifications/NotificationsPage";
import { getNotificationSetup } from "@/serverFunctions/notifications";

export const Route = createFileRoute("/_app/p/$projectId/notifications")({
  loader: ({ params }) => {
    void queryClient.prefetchQuery({
      queryKey: ["notifications-setup", params.projectId],
      queryFn: () =>
        getNotificationSetup({ data: { projectId: params.projectId } }),
    });
  },
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const { projectId } = Route.useParams();

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <ProjectPageHeader projectId={projectId} title="Notifications" />
        <NotificationsPage projectId={projectId} />
      </div>
    </div>
  );
}
