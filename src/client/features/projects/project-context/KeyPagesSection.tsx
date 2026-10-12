import * as React from "react";
import { Badge } from "@/client/components/ui/badge";
import { FormActions } from "@/client/components/FormActions";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  KEY_PAGE_ROLES,
  type KeyPageRole,
  type ProjectContextUpdate,
} from "@/types/schemas/projectContext";
import { EditableListSection } from "./EditableListSection";
import { Provenance, useContextUpdate, type ContextKeyPage } from "./shared";

const ROLE_LABELS: Record<KeyPageRole, string> = {
  hub: "Hub page",
  spoke: "Supporting page",
  money: "Money page",
  other: "Other",
};
const roleItems = KEY_PAGE_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

type KeyPageDraft = {
  url: string;
  role: KeyPageRole;
  topic: string;
  notes: string;
};

export function KeyPagesSection({
  projectId,
  keyPages,
}: {
  projectId: string;
  keyPages: ContextKeyPage[];
}) {
  const update = useContextUpdate(projectId);

  const save = (
    previousUrl: string | null,
    draft: KeyPageDraft,
    close: () => void,
  ) => {
    const ops: ProjectContextUpdate[] = [];
    if (previousUrl && previousUrl !== draft.url.trim()) {
      ops.push({ removeKeyPages: [previousUrl] });
    }
    // Blank values clear stored fields. Omission would preserve agent writes.
    ops.push({
      addKeyPages: [
        {
          url: draft.url.trim(),
          role: draft.role,
          topic: draft.topic.trim(),
          notes: draft.notes.trim(),
        },
      ],
    });
    update.mutate(ops, { onSuccess: close });
  };

  return (
    <EditableListSection
      title="Key pages"
      hint="A shortlist of the pages that carry the site — not an inventory."
      addLabel="Add page"
      emptyTitle="No key pages yet"
      emptyDescription="Add the handful that has to rank, or let an agent propose them from your last site audit."
      items={keyPages}
      getId={(item) => item.id}
      getLabel={(item) => item.url}
      pending={update.isPending}
      onRemove={(item) => update.mutate([{ removeKeyPages: [item.url] }])}
      renderItem={(item) => (
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-medium">{item.url}</span>
            <Badge variant="secondary" size="sm">
              {ROLE_LABELS[item.role]}
            </Badge>
          </div>
          {item.topic ? (
            <p className="text-sm text-muted-foreground">
              Target: {item.topic}
            </p>
          ) : null}
          {item.notes ? (
            <p className="text-sm text-muted-foreground">{item.notes}</p>
          ) : null}
          <Provenance by={item.updatedBy} at={item.updatedAt} />
        </div>
      )}
      renderForm={(item, close) => (
        <KeyPageForm
          initial={item}
          pending={update.isPending}
          onCancel={close}
          onSave={(draft) => save(item?.url ?? null, draft, close)}
        />
      )}
    />
  );
}

function KeyPageForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: ContextKeyPage;
  pending: boolean;
  onCancel: () => void;
  onSave: (draft: KeyPageDraft) => void;
}) {
  const [draft, setDraft] = React.useState<KeyPageDraft>({
    url: initial?.url ?? "",
    role: initial?.role ?? "other",
    topic: initial?.topic ?? "",
    notes: initial?.notes ?? "",
  });

  return (
    <form
      className="space-y-2 bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.url.trim() || pending) return;
        onSave(draft);
      }}
    >
      <Input
        autoFocus
        value={draft.url}
        onChange={(event) => setDraft({ ...draft, url: event.target.value })}
        placeholder="example.com/pricing"
        maxLength={2048}
        aria-label="Page URL"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          items={roleItems}
          value={draft.role}
          onValueChange={(role) => {
            if (role !== null) setDraft({ ...draft, role });
          }}
        >
          <SelectTrigger className="w-full" aria-label="Page role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KEY_PAGE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={draft.topic}
          onChange={(event) =>
            setDraft({ ...draft, topic: event.target.value })
          }
          placeholder="Target topic (optional)"
          maxLength={200}
          aria-label="Target topic"
        />
      </div>
      <Input
        value={draft.notes}
        onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        placeholder="Notes (optional)"
        maxLength={500}
        aria-label="Page notes"
      />
      <FormActions
        pending={pending}
        disabled={!draft.url.trim()}
        onCancel={onCancel}
        size="xs"
      />
    </form>
  );
}
