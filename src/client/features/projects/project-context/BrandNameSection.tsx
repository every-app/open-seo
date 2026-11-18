import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { aiVisibilityKey } from "@/client/features/ai-visibility/shared";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { isDefaultProjectName } from "@/shared/ai-visibility";
import { useContextUpdate } from "./shared";

export function BrandNameSection({
  projectId,
  brandName,
}: {
  projectId: string;
  brandName: string | null;
}) {
  const queryClient = useQueryClient();
  const update = useContextUpdate(projectId);
  const projects = useQuery(projectsQueryOptions());
  const project = projects.data?.find((row) => row.id === projectId);
  const usesDomain = !!project && isDefaultProjectName(project.name);
  // Pinned only while editing, so a write from an agent shows up on refetch.
  const [draft, setDraft] = React.useState<string | null>(null);
  const value = draft ?? brandName ?? "";
  const changed = value.trim() !== (brandName ?? "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (update.isPending || !changed) return;
    update.mutate([{ brandName: value.trim() }], {
      onSuccess: () => {
        setDraft(null);
        void queryClient.invalidateQueries({
          queryKey: aiVisibilityKey(projectId),
        });
        void queryClient.invalidateQueries({
          queryKey: projectsQueryOptions().queryKey,
        });
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <label
        htmlFor="context-brand-name"
        className="text-sm font-medium text-foreground"
      >
        Brand name
      </label>
      <p className="text-xs text-muted-foreground">
        We look for this name in AI answers.
        {!value.trim() &&
          ` Leave blank to use ${usesDomain ? "your domain" : "the project name"}.`}
      </p>
      <Input
        id="context-brand-name"
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={120}
        placeholder={usesDomain ? (project.domain ?? "") : project?.name}
      />
      <div className="flex justify-end pt-2">
        <Button type="submit" size="sm" disabled={update.isPending || !changed}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
