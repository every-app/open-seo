import { Link, useLocation } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Archive, Plus, X } from "lucide-react";
import { archiveSamSession } from "@/serverFunctions/sam";
import {
  invalidateSamSessions,
  samSessionsQueryOptions,
} from "@/client/features/sam/samQueries";
import { QueryState } from "@/client/components/QueryState";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  SidebarMenu,
  SidebarMenuSkeleton,
} from "@/client/components/ui/sidebar";
import { useSamBetaOptIn } from "./samBetaOptIn";
import { useSamSessions } from "./useSamSessions";

const BETA_NOTICE_DISMISSED_KEY = "sam-beta-notice-dismissed";

// The MCP nudge for users who already opted into SAM: SamBetaGate carries it
// before opt-in, and this card keeps it in view afterwards. Dismissible per
// browser; localStorage is read in an effect so SSR and the first client
// render stay identical.
function BetaNotice() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(localStorage.getItem(BETA_NOTICE_DISMISSED_KEY) === "1");
  }, []);
  if (dismissed) return null;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <Badge>Beta</Badge>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          className="text-muted-foreground"
          onClick={() => {
            localStorage.setItem(BETA_NOTICE_DISMISSED_KEY, "1");
            setDismissed(true);
          }}
        >
          <X />
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        For more powerful AI workflows, use the OpenSEO MCP with your own agent
        like Claude Code or Hermes.
      </p>
      <Link
        to="/ai"
        className="mt-1.5 inline-block text-xs text-primary underline-offset-4 hover:underline"
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

/** The chat list's rows while the chats load. */
export function SamChatListSkeleton() {
  return (
    <SidebarMenu aria-busy>
      {Array.from({ length: 4 }, (_, index) => (
        <SidebarMenuSkeleton key={index} />
      ))}
    </SidebarMenu>
  );
}

/**
 * The sidebar while the SAM route is open: the active project's chat history
 * plus a new-chat button. Selecting (or creating) a session navigates to the
 * SAM route; the conversation itself renders in the main content panel.
 */
export function SamSidebarPanel({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: () => void;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const activeSessionId = (location.search as { s?: string }).s;
  const optedIn = useSamBetaOptIn();
  const { sessionsQuery, goToSession, createSession } = useSamSessions(
    projectId,
    { onNavigate },
  );

  const archiveSession = useMutation({
    mutationFn: (sessionId: string) =>
      archiveSamSession({ data: { sessionId } }),
    onSuccess: (_result, sessionId) => {
      // Drop the chat from the cached list before leaving it, so the chat
      // route cannot pick it again as the most recent chat.
      queryClient.setQueryData(
        samSessionsQueryOptions(projectId).queryKey,
        (current) => current?.filter((session) => session.id !== sessionId),
      );
      void invalidateSamSessions(projectId);
      if (sessionId === activeSessionId) goToSession();
    },
  });

  // Until the user opts in, the chat route shows SamBetaGate, so there is no
  // chat list that can be used yet.
  if (!optedIn) {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        Your chats will show here once you opt in to the beta.
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
          className="w-full justify-start gap-2 font-normal text-muted-foreground"
          pending={createSession.isPending}
          onClick={() => createSession.mutate()}
        >
          {createSession.isPending ? null : <Plus />}
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        <QueryState
          query={sessionsQuery}
          errorFallback="Failed to load chats."
          loading={<SamChatListSkeleton />}
        >
          {(loadedSessions) =>
            loadedSessions.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No chats yet. Start a new one.
              </p>
            ) : (
              loadedSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    className={`group flex items-center gap-1 rounded-md px-1 ${
                      isActive
                        ? "bg-sidebar-accent"
                        : "hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => goToSession(session.id)}
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-sidebar-foreground/80"
                    >
                      {session.title}
                    </button>
                    {/* The age and the Archive button share one grid cell, so the
                    button takes the place of the age when it shows. */}
                    <div className="grid shrink-0 place-items-center *:col-start-1 *:row-start-1">
                      <span className="pointer-events-none text-xs text-muted-foreground/75 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 pointer-coarse:opacity-0">
                        {ageLabel(session.updatedAt)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Archive chat"
                        className="text-muted-foreground reveal-on-hover"
                        disabled={archiveSession.isPending}
                        onClick={() => archiveSession.mutate(session.id)}
                      >
                        <Archive />
                      </Button>
                    </div>
                  </div>
                );
              })
            )
          }
        </QueryState>
      </div>

      <BetaNotice />
    </div>
  );
}
