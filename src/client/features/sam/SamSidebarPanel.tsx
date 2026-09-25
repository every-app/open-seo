import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Archive, Loader2, Plus, X } from "@/client/components/icons";
import { archiveSamSession, createSamSession } from "@/serverFunctions/sam";
import {
  invalidateSamSessions,
  samSessionsQueryOptions,
} from "@/client/features/sam/samQueries";
import { useSamBetaOptIn } from "./samBetaOptIn";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { sidebarItemClassName } from "@/client/components/ui/sidebar";
import { Spinner } from "@/client/components/ui/spinner";

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
    <Card className="mx-2 mb-2 p-3">
      <div className="flex items-center justify-between">
        <Badge variant="primary">Beta</Badge>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Dismiss"
          className="size-7"
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
        className="underline underline-offset-4 text-link mt-1.5 inline-block text-xs"
      >
        Set up the MCP →
      </Link>
    </Card>
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
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
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
          className="w-full justify-start gap-2 font-normal"
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
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No chats yet. Start a new one.
          </p>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              // The row takes the sidebar item's fill and text colour; the
              // buttons inside stay transparent and inherit, so fills can't
              // stack and the pill shape carries through to focus rings.
              <div
                key={session.id}
                className={sidebarItemClassName(
                  isActive,
                  "group gap-1 py-0 pl-0 pr-1 font-normal",
                )}
              >
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => goToSession(session.id)}
                  className="h-auto min-w-0 flex-1 justify-start rounded-full px-3 py-2 text-left font-normal text-inherit hover:bg-transparent hover:text-inherit"
                >
                  <span className="truncate">{session.title}</span>
                </Button>
                <span className="shrink-0 text-xs group-hover:hidden">
                  {ageLabel(session.updatedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label="Archive chat"
                  className="hidden size-7 rounded-full group-hover:inline-flex"
                  disabled={archiveSession.isPending}
                  onClick={() => archiveSession.mutate(session.id)}
                >
                  <Archive className="size-3.5" />
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
