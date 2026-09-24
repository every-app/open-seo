import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect, useRef } from "react";
import { Brain, Loader2 } from "lucide-react";
import { createSamSession } from "@/serverFunctions/sam";
import {
  invalidateSamSessions,
  samSessionsQueryOptions,
} from "@/client/features/sam/samQueries";
import { useSamAccess } from "./useSamAccess";
import { optInToSamBeta, useSamBetaOptIn } from "./samBetaOptIn";
import { SamBetaGate } from "./SamBetaGate";
import { SamSetupGate } from "./SamSetupGate";
import { SamConversation } from "./SamConversation";

/**
 * The SAM route's content: the active conversation, full-width. The chat
 * history list lives in the app sidebar's Chat tab (SamSidebarPanel); this
 * component gates on the beta opt-in, then lands the user in the most recent
 * session, creating one when the project has none.
 */
export function SamChat({
  projectId,
  activeSessionId,
}: {
  projectId: string;
  activeSessionId: string | undefined;
}) {
  const navigate = useNavigate();
  const optedIn = useSamBetaOptIn();
  const access = useSamAccess(projectId);
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

  // The ref (not isPending) guards the auto-create below: React can re-run the
  // effect before the mutation state updates, and it resets on settle so
  // archiving the last chat starts a fresh one.
  const creating = useRef(false);
  const createSession = useMutation({
    mutationFn: () => createSamSession({ data: { projectId } }),
    onSuccess: ({ id }) => {
      invalidateSamSessions(projectId);
      goToSession(id);
    },
    onSettled: () => {
      creating.current = false;
    },
  });

  // Landing without a session: open the most recent one, or start a fresh
  // chat when the project has none.
  const firstSessionId = sessions[0]?.id;
  const { mutate: createSessionMutate } = createSession;
  useEffect(() => {
    if (activeSessionId || !optedIn || access.showSetupGate) return;
    if (firstSessionId) {
      goToSession(firstSessionId);
      return;
    }
    if (!sessionsQuery.isSuccess || creating.current) return;
    creating.current = true;
    createSessionMutate();
  }, [
    activeSessionId,
    optedIn,
    access.showSetupGate,
    firstSessionId,
    sessionsQuery.isSuccess,
    goToSession,
    createSessionMutate,
  ]);

  if (!optedIn) {
    return <SamBetaGate onContinue={optInToSamBeta} />;
  }

  // SAM cannot answer a turn without OPENROUTER_API_KEY, so surface setup
  // instructions instead of letting a chat fail mid-stream. Only shown once the
  // check confirms the key is missing (self-hosted) — never as a blocking
  // skeleton while the check is in flight.
  if (access.showSetupGate) {
    return (
      <div className="overflow-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-3xl">
          <SamSetupGate
            errorMessage={access.errorMessage}
            isRefetching={access.isRefetching}
            onRetry={access.onRetry}
          />
        </div>
      </div>
    );
  }

  if (!activeSessionId) {
    // Sessions are loading or a fresh chat is being created; the effect above
    // redirects into it.
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  const activeTitle = sessions.find(
    (session) => session.id === activeSessionId,
  )?.title;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Session title + the shortest path to inspect or correct the shared
          memory SAM reads and writes during the conversation. */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <span className="truncate text-sm font-medium text-foreground">
          {activeTitle ?? "Chat"}
        </span>
        <Link
          to="/p/$projectId/context"
          params={{ projectId }}
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Brain className="size-3.5" />
          Project memory
        </Link>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* useAgentChat suspends while it fetches the session's history; this
            boundary keeps that suspension inside the chat panel instead of
            letting it bubble up and swap out the whole shell — which read as
            a full page refresh on every session switch. */}
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground/70" />
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
    </div>
  );
}
