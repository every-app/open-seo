import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SamChat } from "@/client/features/sam/SamChat";

const samSearchSchema = z.object({
  // Active session id. Omitted until a session is selected/created.
  s: z.string().optional(),
});

export const Route = createFileRoute("/_project/p/$projectId/sam")({
  validateSearch: samSearchSchema,
  component: SamRoute,
});

function SamRoute() {
  const { projectId } = Route.useParams();
  const { s } = Route.useSearch();
  return <SamChat projectId={projectId} activeSessionId={s} />;
}
