import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Archive, Loader2, Plus, X } from "lucide-react";
import { archiveSamSession, createSamSession } from "@/serverFunctions/sam";
import {
  invalidateSamSessions,
  samSessionsQueryOptions,
} from "@/client/features/sam/samQueries";

const BETA_NOTICE_DISMISSED_KEY = "sam-beta-notice-dismissed";

// Beta framing + the MCP power-path nudge, pinned to the bottom of the Chat
// tab. Dismissible per browser; localStorage is read in an effect so SSR and
// the first client render stay identical (same pattern as AppShell).
function BetaNotice() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(localStorage.getItem(BETA_NOTICE_DISMISSED_KEY) === "1");
  }, []);
  if (dismissed) return null;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="flex items-center justify-between">
        <span className="badge badge-primary badge-sm">Beta</span>
        <button
          type="button"
          aria-label="Dismiss"
          className="btn btn-ghost btn-xs btn-square text-base-content/40"
          onClick={() => {
            localStorage.setItem(BETA_NOTICE_DISMISSED_KEY, "1");
            setDismissed(true);
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-base-content/70">
        For more powerful AI workflows, use the OpenSEO MCP with your own agent
        like Claude Code or Hermes.
      </p>
      <Link to="/ai" className="link link-primary mt-1.5 inline-block text-xs">
        Set up the MCP →
      </Link>
    </div>
  );
}

// Compact age label for the session list (PostHog-style "3h" / "12d").
// Timestamps come back as UTC from both backends: D1 as "YYYY-MM-DD HH:MM:SS"
// (no zone marker), Postgres as ISO-8601 with a trailing Z.
function ageLabel(timestamp: string): string {
  const iso = timestamp.includes("T") ? timestamp : `${timestamp}Z`;
  const then = new Date(iso.replace(" ", "T")).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * The sidebar's Chat tab: the active project's chat history plus a new-chat
 * button. Selecting (or creating) a session navigates to the SAM route; the
 * conversation itself renders in the main content panel.
 */
export function SamSidebarPanel({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeSessionId = (location.search as { s?: string }).s;

  const sessionsQuery = useQuery(samSessionsQueryOptions(projectId));
  const sessions = sessionsQuery.data ?? [];

  const goToSession = (sessionId: string | undefined) => {
    void navigate({
      to: "/p/$projectId/sam",
      params: { projectId },
      search: sessionId ? { s: sessionId } : {},
    });
    onNavigate?.();
  };

  const createSession = useMutation({
    mutationFn: () => createSamSession({ data: { projectId } }),
    onSuccess: ({ id }) => {
      invalidateSamSessions(projectId);
      goToSession(id);
    },
  });

  const archiveSession = useMutation({
    mutationFn: (sessionId: string) =>
      archiveSamSession({ data: { sessionId } }),
    onSuccess: (_result, sessionId) => {
      invalidateSamSessions(projectId);
      if (sessionId === activeSessionId) {
        goToSession(sessions.find((s) => s.id !== sessionId)?.id);
      }
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-1">
        {/* Ghost row styled like a list item so the sidebar header doesn't
            stack three heavy full-width controls. */}
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-block justify-start gap-2 font-normal text-base-content/70 hover:text-base-content"
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {sessionsQuery.isLoading ? (
          <div className="flex justify-center py-6 text-base-content/50">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-base-content/50">
            No chats yet. Start a new one.
          </p>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={`group flex items-center gap-1 rounded-md px-1 ${
                  isActive ? "bg-base-300/50" : "hover:bg-base-300/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => goToSession(session.id)}
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-base-content/80"
                >
                  {session.title}
                </button>
                <span className="shrink-0 text-xs text-base-content/40 group-hover:hidden">
                  {ageLabel(session.updatedAt)}
                </span>
                <button
                  type="button"
                  aria-label="Archive chat"
                  className="btn btn-ghost btn-xs btn-square hidden group-hover:inline-flex"
                  disabled={archiveSession.isPending}
                  onClick={() => archiveSession.mutate(session.id)}
                >
                  <Archive className="size-3.5 text-base-content/50" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <BetaNotice />
    </div>
  );
}
