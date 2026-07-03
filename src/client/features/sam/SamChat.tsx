import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect } from "react";
import { Loader2, Plus, Wrench } from "lucide-react";
import { createSamSession } from "@/serverFunctions/sam";
import {
  invalidateSamSessions,
  samSessionsQueryOptions,
} from "@/client/features/sam/samQueries";
import { SamConversation } from "./SamConversation";

/**
 * The SAM route's content: the active conversation, full-width. The chat
 * history list lives in the app sidebar's Chat tab (SamSidebarPanel); this
 * component only auto-selects the most recent session on landing and shows the
 * start-a-chat empty state when the project has none.
 */
export function SamChat({
  projectId,
  activeSessionId,
}: {
  projectId: string;
  activeSessionId: string | undefined;
}) {
  const navigate = useNavigate();
  const sessionsQuery = useQuery(samSessionsQueryOptions(projectId));
  const sessions = sessionsQuery.data ?? [];

  const goToSession = useCallback(
    (sessionId: string) =>
      void navigate({
        to: "/p/$projectId/sam",
        params: { projectId },
        search: { s: sessionId },
        replace: true,
      }),
    [navigate, projectId],
  );

  const createSession = useMutation({
    mutationFn: () => createSamSession({ data: { projectId } }),
    onSuccess: ({ id }) => {
      invalidateSamSessions(projectId);
      goToSession(id);
    },
  });

  // Default to the most recent session once they load; if none exist, leave the
  // empty state so the user can start one explicitly.
  const firstSessionId = sessions[0]?.id;
  useEffect(() => {
    if (activeSessionId || !firstSessionId) return;
    goToSession(firstSessionId);
  }, [activeSessionId, firstSessionId, goToSession]);

  if (activeSessionId) {
    return (
      <div className="flex h-full min-h-0">
        {/* useAgentChat suspends while it fetches the session's history; this
            boundary keeps that suspension inside the chat panel instead of
            letting it bubble up and swap out the whole shell — which read as
            a full page refresh on every session switch. */}
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-base-content/40" />
            </div>
          }
        >
          <SamConversation
            key={activeSessionId}
            projectId={projectId}
            sessionId={activeSessionId}
          />
        </Suspense>
      </div>
    );
  }

  if (sessionsQuery.isLoading) {
    // Sessions are still loading; the auto-select effect will redirect into
    // the most recent one. Show a loader instead of flashing the empty state.
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-base-content/40" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Wrench className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-medium">What should we work on?</p>
        <p className="max-w-sm text-sm text-base-content/60">
          SAM is your in-app SEO agent with access to every OpenSEO research
          tool. Start a chat to get going.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm gap-1"
        disabled={createSession.isPending}
        onClick={() => createSession.mutate()}
      >
        {createSession.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        New chat
      </button>
    </div>
  );
}
