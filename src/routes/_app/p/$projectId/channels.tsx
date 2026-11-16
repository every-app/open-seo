import { createFileRoute } from "@tanstack/react-router";
import { ChannelsPage } from "@/client/features/platform-seo/publish/ChannelsPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/channels")({
  head: () => pageHead("Channels"),
  component: ChannelsRoute,
});

function ChannelsRoute() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto">
      <ChannelsPage projectId={projectId} />
    </div>
  );
}
