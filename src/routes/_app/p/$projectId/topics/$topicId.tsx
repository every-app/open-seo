import { createFileRoute } from "@tanstack/react-router";
import { TopicDetailPage } from "@/client/features/platform-seo/topics/TopicDetailPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/topics/$topicId")({
  head: () => pageHead("Topic"),
  component: TopicRoute,
});

function TopicRoute() {
  const { projectId, topicId } = Route.useParams();
  return (
    <div className="h-full overflow-auto">
      <TopicDetailPage projectId={projectId} topicId={topicId} />
    </div>
  );
}
