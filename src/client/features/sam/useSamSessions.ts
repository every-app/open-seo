import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { createSamSession } from "@/serverFunctions/sam";
import {
  invalidateSamSessions,
  samSessionsQueryOptions,
} from "@/client/features/sam/samQueries";

/**
 * The project's chat list, a way to open a chat, and a way to start one. The
 * chat route and the sidebar's Chat tab share this so both navigate the same
 * way. `goToSession()` with no id opens the chat route, which picks the most
 * recent chat or starts a new one.
 */
export function useSamSessions(
  projectId: string,
  {
    replace = false,
    onNavigate,
    onCreateError,
    onCreateSettled,
  }: {
    replace?: boolean;
    onNavigate?: () => void;
    onCreateError?: (error: Error) => void;
    onCreateSettled?: () => void;
  } = {},
) {
  const navigate = useNavigate();
  const sessionsQuery = useQuery(samSessionsQueryOptions(projectId));

  const goToSession = useCallback(
    (sessionId?: string) => {
      void navigate({
        to: "/p/$projectId/sam",
        params: { projectId },
        search: sessionId ? { s: sessionId } : {},
        replace,
      });
      onNavigate?.();
    },
    [navigate, projectId, replace, onNavigate],
  );

  const createSession = useMutation({
    mutationFn: () => createSamSession({ data: { projectId } }),
    // Wait for the list to hold the new chat before opening it: the chat
    // route treats an id missing from the list as archived or unknown.
    onSuccess: async ({ id }) => {
      await invalidateSamSessions(projectId);
      goToSession(id);
    },
    // On the mutation, not per call: per-call callbacks go through the
    // observer and are skipped when it detaches (StrictMode's double mount).
    // Passing onCreateError also keeps the global error toast quiet, since
    // the caller shows the error itself.
    onError: onCreateError,
    onSettled: onCreateSettled,
  });

  return {
    sessionsQuery,
    sessions: sessionsQuery.data ?? [],
    goToSession,
    createSession,
  };
}
