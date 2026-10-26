import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LocalTrackerList } from "@/client/features/local-seo/LocalTrackerList";
import { LocalTrackerDialog } from "@/client/features/local-seo/LocalTrackerDialog";

export const Route = createFileRoute("/_app/p/$projectId/local-seo/")({
  remountDeps: ({ params }) => params.projectId,
  component: LocalSeoIndex,
});
function LocalSeoIndex() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <LocalTrackerList projectId={projectId} onAdd={() => setAdding(true)} />
      {adding && (
        <LocalTrackerDialog
          projectId={projectId}
          onClose={() => setAdding(false)}
          onCreated={(trackerId) => {
            setAdding(false);
            void navigate({
              to: "/p/$projectId/local-seo/$trackerId",
              params: { projectId, trackerId },
              search: {},
            });
          }}
        />
      )}
    </>
  );
}
