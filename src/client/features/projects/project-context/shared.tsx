import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
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
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Couldn't save your changes")),
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
    <span className="text-xs text-base-content/40">
      {at
        ? `Updated by ${AUTHOR_LABELS[by]} · ${formatRelativeTime(at)}`
        : `Added by ${AUTHOR_LABELS[by]}`}
    </span>
  );
}

function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "recently";

  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-medium text-base-content/50">{title}</h2>
        {hint ? <p className="text-xs text-base-content/50">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Muted panel used when a list has nothing in it yet. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-base-300 px-4 py-3 text-sm text-base-content/60">
      {children}
    </p>
  );
}

export const listClass =
  "divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300";

/** Row actions and footer buttons shared by the inline competitor/page forms. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-1">{children}</div>;
}

/**
 * Two-step delete: the trash icon swaps to an explicit Remove/Cancel pair, so
 * a stray click can't destroy anything and no native confirm dialog is needed.
 */
export function ConfirmDeleteButton({
  label,
  pending,
  onConfirm,
}: {
  label: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <>
        <button
          type="button"
          className="btn btn-error btn-xs"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          Remove
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs text-error"
      aria-label={label}
      disabled={pending}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

export function FormActions({
  pending,
  disabled,
  onCancel,
}: {
  pending: boolean;
  disabled: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={onCancel}
        disabled={pending}
      >
        Cancel
      </button>
      <button
        type="submit"
        className="btn btn-primary btn-xs"
        disabled={disabled || pending}
      >
        Save
      </button>
    </div>
  );
}
