import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import { GoogleAnalyticsConnectionCard } from "@/client/features/ga4/GoogleAnalyticsConnectionCard";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  clearLastProjectId,
  getLastProjectId,
} from "@/client/lib/active-project";
import {
  archiveProject,
  getProjects,
  updateProject,
} from "@/serverFunctions/projects";
import type { ProjectSummary } from "./types";

export function ProjectSettings({ projectId }: { projectId: string }) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projects = projectsQuery.data ?? [];
  const project = projects.find((entry) => entry.id === projectId) ?? null;

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 p-4 py-8 sm:p-6 md:py-12">
      <div className="space-y-4">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-sm text-base-content/60 transition-colors hover:text-base-content"
        >
          <ChevronLeft className="size-4" />
          项目
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">项目设置</h1>
          <p className="text-sm text-base-content/60">{project.name}</p>
        </div>
      </div>

      {/* key resets the form's local state when switching between projects */}
      <GeneralSection key={project.id} project={project} />

      <section id="search-console" className="space-y-3 scroll-mt-6">
        <h2 className="text-sm font-medium text-base-content/50">
          Search Console
        </h2>
        <SearchConsoleConnectionCard projectId={projectId} />
      </section>

      <section id="google-analytics" className="space-y-3 scroll-mt-6">
        <h2 className="text-sm font-medium text-base-content/50">数据分析</h2>
        <GoogleAnalyticsConnectionCard projectId={projectId} />
      </section>

      <DangerSection project={project} canArchive={projects.length > 1} />
    </div>
  );
}

function GeneralSection({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(project.name);
  const [domain, setDomain] = React.useState(project.domain ?? "");
  const [market, setMarket] = React.useState({
    locationCode: project.locationCode,
    languageCode: project.languageCode,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProject({
        data: {
          projectId: project.id,
          name: name.trim(),
          domain: domain.trim() || undefined,
          ...market,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("项目已更新");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "项目更新失败")),
  });

  const isDirty =
    name.trim() !== project.name ||
    (domain.trim() || "") !== (project.domain ?? "") ||
    market.locationCode !== project.locationCode ||
    market.languageCode !== project.languageCode;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (updateMutation.isPending) return;
    if (!name.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">基本信息</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">名称</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="input input-bordered w-full"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            域名 <span className="text-base-content/50">（可选）</span>
          </span>
          <input
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            maxLength={255}
            className="input input-bordered w-full"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <ProjectMarketFields value={market} onChange={setMarket} />
          <span className="text-xs text-base-content/50">
            关键词、SERP
            和域名数据默认使用此国家或地区及语言，调用时也可另行指定。
          </span>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={updateMutation.isPending || !isDirty}
          >
            保存更改
          </button>
        </div>
      </form>
    </section>
  );
}

function DangerSection({
  project,
  canArchive,
}: {
  project: ProjectSummary;
  canArchive: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject({ data: { projectId: project.id } }),
    onSuccess: async () => {
      if (getLastProjectId() === project.id) clearLastProjectId();
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("项目已归档");
      // Re-resolve to a remaining project via the landing redirect.
      void navigate({ to: "/" });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "项目归档失败")),
  });

  return (
    <section className="space-y-3 border-t border-base-300 pt-8">
      <h2 className="text-sm font-medium text-base-content/50">归档项目</h2>

      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            归档中{" "}
            <span className="font-medium text-base-content">
              {project.name}
            </span>{" "}
            会将其移出工作区并停止定时排名追踪。之后可在“项目”页面恢复。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-error btn-sm"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              确认归档项目
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
              disabled={archiveMutation.isPending}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-base-content/60">
            {canArchive
              ? "归档此项目并将其移出工作区。"
              : "仅有一个项目时无法归档。"}
          </p>
          <button
            type="button"
            className="btn btn-outline btn-error btn-sm shrink-0"
            onClick={() => setConfirming(true)}
            disabled={!canArchive}
          >
            归档项目
          </button>
        </div>
      )}
    </section>
  );
}
