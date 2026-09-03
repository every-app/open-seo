import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ListChecks, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  listContentExecutionItems,
  updateContentExecutionItem,
} from "@/serverFunctions/content-execution";
import type { UpdateContentExecutionItemInput } from "@/types/schemas/content-execution";
import { ContentExecutionTable } from "./ContentExecutionTable";

type ExecutionUpdate = Omit<
  UpdateContentExecutionItemInput,
  "projectId" | "executionItemId"
>;

function EmptyExecutionState({ projectId }: { projectId: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <ListChecks className="mx-auto size-10 text-base-content/30" />
      <h2 className="mt-4 text-lg font-semibold">No work items yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-base-content/65">
        Select related queries in Saved Keywords and create one page-level work
        item.
      </p>
      <Link
        to="/p/$projectId/saved"
        params={{ projectId }}
        className="btn btn-primary btn-sm mt-5 gap-1"
      >
        Choose saved keywords
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

export function ContentExecutionPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["contentExecution", projectId],
    queryFn: () => listContentExecutionItems({ data: { projectId } }),
  });
  const updateMutation = useMutation({
    mutationFn: (input: { id: string; update: ExecutionUpdate }) => {
      setPendingItemId(input.id);
      return updateContentExecutionItem({
        data: {
          projectId,
          executionItemId: input.id,
          ...input.update,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["contentExecution", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
      toast.success("Work item updated");
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Could not update work item"));
    },
    onSettled: () => setPendingItemId(null),
  });

  return (
    <main className="overflow-auto px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            Page-level delivery
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Content Execution</h1>
          <p className="mt-1 max-w-2xl text-sm text-base-content/65">
            One work item represents one page. Its supporting keyword variants
            share the same owner and status.
          </p>
        </header>

        <section className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
          {query.isLoading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-base-content/60">
              <Loader2 className="size-4 animate-spin" />
              Loading work items
            </div>
          ) : query.isError ? (
            <div role="alert" className="alert alert-error m-4 text-sm">
              Could not load content execution. Please try again.
            </div>
          ) : query.data?.length ? (
            <ContentExecutionTable
              items={query.data}
              pendingItemId={pendingItemId}
              onUpdate={(id, update) => updateMutation.mutate({ id, update })}
            />
          ) : (
            <EmptyExecutionState projectId={projectId} />
          )}
        </section>
      </div>
    </main>
  );
}
