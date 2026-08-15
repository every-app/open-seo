import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  getWorkspaceMergeStatus,
  mergeLegacyWorkspaces,
} from "@/serverFunctions/workspace";

// Shown on self-hosted Cloudflare Access deployments that still have per-user
// workspaces from before the shared workspace existed. The server decides
// visibility (AUTH_MODE is a runtime var there); hosted builds skip the query
// entirely since the mode is known at build time.
export function WorkspaceMergeBanner() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["workspaceMergeStatus"],
    queryFn: () => getWorkspaceMergeStatus(),
    enabled: !isHostedClientAuthMode(),
  });

  const mergeMutation = useMutation({
    mutationFn: () => mergeLegacyWorkspaces(),
    onSuccess: ({ mergedWorkspaces }) => {
      toast.success(`已将 ${mergedWorkspaces} 个工作区迁移到共享工作区。`);
      // The merge changes projects, connections, and the banner's own status —
      // refetch everything rather than enumerating keys.
      void queryClient.invalidateQueries();
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "无法迁移工作区，请重试。")),
  });

  if (!statusQuery.data || statusQuery.data.legacyWorkspaceCount === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-5">
      <p className="max-w-3xl text-sm">
        Cloudflare
        自托管版本曾存在工作区问题，每位用户会获得独立工作区。系统设计为所有用户共用一个工作区。点击下方按钮可将所有用户之前的内容迁移到共享工作区。
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm mt-4"
        disabled={mergeMutation.isPending}
        onClick={() => mergeMutation.mutate()}
      >
        {mergeMutation.isPending ? "迁移中…" : "迁移工作区"}
      </button>
    </div>
  );
}
