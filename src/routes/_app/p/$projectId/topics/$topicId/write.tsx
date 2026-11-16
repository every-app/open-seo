import { createFileRoute } from "@tanstack/react-router";
import { ArticleEditorPage } from "@/client/features/platform-seo/write/ArticleEditorPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute(
  "/_app/p/$projectId/topics/$topicId/write",
)({
  head: () => pageHead("Write"),
  component: WriteRoute,
});

function WriteRoute() {
  const { projectId, topicId } = Route.useParams();
  return (
    <div className="h-full overflow-auto">
      <ArticleEditorPage projectId={projectId} topicId={topicId} />
    </div>
  );
}
