import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Archive, Loader2, Plus, X } from "lucide-react";
import { archiveSamSession, createSamSession } from "@/serverFunctions/sam";
import {
  invalidateSamSessions,
  samSessionsQueryOptions,
} from "@/client/features/sam/samQueries";
import { useSamBetaOptIn } from "./samBetaOptIn";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
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
    <div className="mx-2 mb-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <Badge variant="primary" className="px-2 text-[11px]">
          Beta
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Dismiss"
          className="size-7 text-muted-foreground/70"
          onClick={() => {
            localStorage.setItem(BETA_NOTICE_DISMISSED_KEY, "1");
            setDismissed(true);
          }}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        For more powerful AI workflows, use the OpenSEO MCP with your own agent
        like Claude Code or Hermes.
      </p>
      <Link
        to="/ai"
        className="underline underline-offset-4 text-primary mt-1.5 inline-block text-xs"
      >
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
  const optedIn = useSamBetaOptIn();

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

  // Until the user opts in, the chat route shows SamBetaGate; the tab just
  // points there instead of offering a chat list that can't be used yet.
  if (!optedIn) {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground/70">
        Sam is in beta and opt-in. Open Chat to read more and decide.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-1">
        {/* Ghost row styled like a list item so the sidebar header doesn't
            stack three heavy full-width controls. */}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="w-full justify-start gap-2 font-normal text-muted-foreground hover:text-foreground"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate()}
        >
          {createSession.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {sessionsQuery.isLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground/70">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">
            No chats yet. Start a new one.
          </p>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={`group flex items-center gap-1 rounded-md px-1 ${
                  isActive ? "bg-border/50" : "hover:bg-border/40"
                }`}
              >
                <Button
                  variant="ghost"
                  onClick={() => goToSession(session.id)}
                  className="h-auto rounded-md justify-start whitespace-normal text-left font-normal min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-foreground"
                >
                  {session.title}
                </Button>
                <span className="shrink-0 text-xs text-muted-foreground/70 group-hover:hidden">
                  {ageLabel(session.updatedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label="Archive chat"
                  className="size-7 hidden group-hover:inline-flex"
                  disabled={archiveSession.isPending}
                  onClick={() => archiveSession.mutate(session.id)}
                >
                  <Archive className="size-3.5 text-muted-foreground/70" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      <BetaNotice />
    </div>
  );
}
