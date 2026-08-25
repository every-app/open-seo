import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import type { ProjectContextUpdate } from "@/types/schemas/projectContext";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormActions,
  listClass,
  Provenance,
  RowActions,
  SectionHeader,
  useContextUpdate,
  type ContextCompetitor,
} from "./shared";

export function CompetitorsSection({
  projectId,
  competitors,
}: {
  projectId: string;
  competitors: ContextCompetitor[];
}) {
  const update = useContextUpdate(projectId);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const save = (previousDomain: string | null, draft: CompetitorDraft) => {
    const ops: ProjectContextUpdate[] = [];
    // Competitors upsert by domain, so a retyped domain has to drop the old row
    // before the new one lands.
    if (previousDomain && previousDomain !== draft.domain.trim()) {
      ops.push({ removeCompetitors: [previousDomain] });
    }
    // Send the fields even when blank: an omitted field means "keep what's
    // stored" (so agent writes merge), so clearing one from the form has to
    // send the empty string.
    ops.push({
      addCompetitors: [
        {
          domain: draft.domain.trim(),
          name: draft.name.trim(),
          notes: draft.notes.trim(),
        },
      ],
    });
    update.mutate(ops, {
      onSuccess: () => {
        setAdding(false);
        setEditingId(null);
      },
    });
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Competitors"
        hint="The sites you measure yourself against."
        action={
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-3.5" />
            Add competitor
          </button>
        }
      />

      {adding ? (
        <div className={listClass}>
          <CompetitorForm
            pending={update.isPending}
            onCancel={() => setAdding(false)}
            onSave={(draft) => save(null, draft)}
          />
        </div>
      ) : null}

      {competitors.length === 0 ? (
        adding ? null : (
          <EmptyState>
            No competitors yet. Add the sites you compete with, or ask SAM to
            find them from your rankings and save them here.
          </EmptyState>
        )
      ) : (
        <ul className={listClass}>
          {competitors.map((competitor) =>
            editingId === competitor.id ? (
              <li key={competitor.id}>
                <CompetitorForm
                  initial={competitor}
                  pending={update.isPending}
                  onCancel={() => setEditingId(null)}
                  onSave={(draft) => save(competitor.domain, draft)}
                />
              </li>
            ) : (
              <li
                key={competitor.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate text-sm font-medium">
                      {competitor.domain}
                    </span>
                    {competitor.name ? (
                      <span className="truncate text-xs text-base-content/60">
                        {competitor.name}
                      </span>
                    ) : null}
                  </div>
                  {competitor.notes ? (
                    <p className="text-sm text-base-content/70">
                      {competitor.notes}
                    </p>
                  ) : null}
                  <Provenance
                    by={competitor.updatedBy}
                    at={competitor.updatedAt}
                  />
                </div>
                <RowActions>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label={`Edit ${competitor.domain}`}
                    onClick={() => setEditingId(competitor.id)}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <ConfirmDeleteButton
                    label={`Remove ${competitor.domain}`}
                    pending={update.isPending}
                    onConfirm={() =>
                      update.mutate([
                        { removeCompetitors: [competitor.domain] },
                      ])
                    }
                  />
                </RowActions>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

type CompetitorDraft = { domain: string; name: string; notes: string };

function CompetitorForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: ContextCompetitor;
  pending: boolean;
  onCancel: () => void;
  onSave: (draft: CompetitorDraft) => void;
}) {
  const [draft, setDraft] = React.useState<CompetitorDraft>({
    domain: initial?.domain ?? "",
    name: initial?.name ?? "",
    notes: initial?.notes ?? "",
  });

  return (
    <form
      className="space-y-2 bg-base-200/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.domain.trim() || pending) return;
        onSave(draft);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          autoFocus
          type="text"
          value={draft.domain}
          onChange={(event) =>
            setDraft({ ...draft, domain: event.target.value })
          }
          placeholder="competitor.com"
          maxLength={255}
          className="input input-bordered input-sm w-full"
          aria-label="Competitor domain"
        />
        <input
          type="text"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="Name (optional)"
          maxLength={120}
          className="input input-bordered input-sm w-full"
          aria-label="Competitor name"
        />
      </div>
      <input
        type="text"
        value={draft.notes}
        onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        placeholder="Why they matter — e.g. wins every comparison keyword (optional)"
        maxLength={500}
        className="input input-bordered input-sm w-full"
        aria-label="Competitor notes"
      />
      <FormActions
        pending={pending}
        disabled={!draft.domain.trim()}
        onCancel={onCancel}
      />
    </form>
  );
}
