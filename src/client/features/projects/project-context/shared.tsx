import { formatRelativeTime } from "@/client/lib/relative-time";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateProjectContext } from "@/serverFunctions/projectContext";
import type { getProjectContext } from "@/serverFunctions/projectContext";
import type {
  ContextAuthor,
  ProjectContextUpdate,
} from "@/types/schemas/projectContext";

export type ProjectContextData = Awaited<ReturnType<typeof getProjectContext>>;
export type ContextCompetitor = ProjectContextData["competitors"][number];
export type ContextKeyPage = ProjectContextData["keyPages"][number];

export function projectContextQueryKey(projectId: string) {
  return ["projectContext", projectId];
}

/**
 * Every edit on this page is a patch op against the same endpoint, so all of
 * them share one mutation. The server function returns the context as it
 * stands after the patch, which becomes the new cache entry — no refetch.
 */
export function useContextUpdate(projectId: string) {
  const queryClient = useQueryClient();
  const queryKey = projectContextQueryKey(projectId);

  return useMutation({
    mutationFn: (updates: ProjectContextUpdate[]) =>
      updateProjectContext({ data: { projectId, updates } }),
    // An in-flight refetch would overwrite the fresher setQueryData below
    // with its pre-mutation snapshot.
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onSuccess: (context) => {
      queryClient.setQueryData(queryKey, context);
      toast.success("Project context updated");
    },
    // The page instantiates this mutation per section, so two concurrent
    // patches can settle out of order and the slower (earlier-snapshotted)
    // response can land in the cache last; a settle-time refetch converges
    // the page back onto the server's state.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

const AUTHOR_LABELS: Record<ContextAuthor, string> = {
  user: "you",
  sam: "SAM",
  mcp: "your AI client",
};

export function Provenance({ by, at }: { by: ContextAuthor; at?: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {at
        ? `Updated by ${AUTHOR_LABELS[by]} · ${formatRelativeTime(at)}`
        : `Added by ${AUTHOR_LABELS[by]}`}
    </span>
  );
}

export const listClass =
  "divide-y divide-border overflow-hidden rounded-lg border border-border bg-card";

/** Row actions and footer buttons shared by the inline competitor/page forms. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-1">{children}</div>;
}
