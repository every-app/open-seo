import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { setLastProjectId } from "@/client/lib/active-project";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/client/features/keywords/locations";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import { createProject } from "@/serverFunctions/projects";

import { Button } from "@/client/components/ui/button";
import { DialogTitle } from "@/client/components/ui/dialog";
import { Field, FieldDescription } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const nameId = React.useId();
  const domainId = React.useId();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [market, setMarket] = React.useState({
    locationCode: DEFAULT_LOCATION_CODE,
    languageCode: getLanguageCode(DEFAULT_LOCATION_CODE),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        data: {
          name: name.trim(),
          domain: domain.trim() || undefined,
          ...market,
        },
      }),
    onSuccess: async (created) => {
      setLastProjectId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({
        queryKey: ["dashboardActivation"],
      });
      onClose();
      toast.success("Project created");
      // Continue setup through the new project’s dashboard.
      void navigate({
        to: "/p/$projectId",
        params: { projectId: created.id },
      });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to create project")),
  });

  const isPending = createMutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={isPending ? undefined : onClose}
      labelledBy="create-project-title"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <DialogTitle id="create-project-title">New project</DialogTitle>

        <Field>
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Inc."
            maxLength={120}
            autoFocus
          />
        </Field>

        <Field>
          <Label htmlFor={domainId}>
            Domain <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={domainId}
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            maxLength={255}
          />
          <FieldDescription className="text-xs">
            You can connect Search Console and set up rank tracking after
            creating the project.
          </FieldDescription>
        </Field>

        <Field>
          <ProjectMarketFields value={market} onChange={setMarket} />
          <FieldDescription className="text-xs">
            Keyword, SERP, and domain data uses this country and language unless
            a call asks for a different one. Change it later in project
            settings.
          </FieldDescription>
        </Field>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={isPending}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
