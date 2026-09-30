import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "@/client/components/icons";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getProjectContext } from "@/serverFunctions/projectContext";
import {
  PROJECT_CONTEXT_SECTION_KEYS,
  PROJECT_CONTEXT_SECTION_LABELS,
  PROSE_MAX_CHARS,
  type ProjectContextSectionKey,
} from "@/types/schemas/projectContext";
import { CompetitorsSection } from "./CompetitorsSection";
import { KeyPagesSection } from "./KeyPagesSection";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormActions,
  listClass,
  Provenance,
  RowActions,
  SectionHeader,
  projectContextQueryKey,
  useContextUpdate,
  type ProjectContextData,
} from "./shared";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Field, FieldDescription } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";

const SECTION_HINTS: Record<ProjectContextSectionKey, string> = {
  business_overview: "What you sell, who buys it, and where.",
  current_goal: "What you're pushing for right now, and by when.",
  positioning: "Why someone picks you over the alternatives.",
  writing_preferences: "Voice, words to avoid, topics that are off-limits.",
};

const SECTION_PLACEHOLDERS: Record<ProjectContextSectionKey, string> = {
  business_overview:
    "e.g. Booking software for independent restaurants in the US and Canada. Buyers are owner-operators, not marketers.",
  current_goal:
    "e.g. Double organic signups by Q4. Comparison pages are the current bet.",
  positioning:
    "e.g. The only booking tool that sets up in an afternoon. Cheaper than the incumbents, simpler than the DIY stack.",
  writing_preferences:
    "e.g. Plain and direct, no hype. Never say 'seamless' or 'game-changing'. Don't write about competitor pricing.",
};

export function ProjectContextPage({ projectId }: { projectId: string }) {
  const contextQuery = useQuery({
    queryKey: projectContextQueryKey(projectId),
    queryFn: () => getProjectContext({ data: { projectId } }),
    // This page exists to inspect what agents just wrote; the app-wide
    // 5-minute staleTime would show pre-SAM-turn memory as current.
    staleTime: 0,
  });

  if (contextQuery.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (contextQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="text-sm">
          {getStandardErrorMessage(
            contextQuery.error,
            "Failed to load project context",
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const context = contextQuery.data;

  return (
    // key remounts the whole page when the project switches under it, so no
    // draft, open form, or edit state can carry over to another project.
    <div key={projectId} className="space-y-8">
      <p className="text-sm text-muted-foreground">
        What SAM, Claude Code, and any connected MCP client know about this
        project. They read it before they work and write back what they learn,
        so correct anything that looks wrong.
      </p>

      <ProseSections
        projectId={projectId}
        sections={context.sections}
        missingSections={context.missingSections}
      />

      <CompetitorsSection
        projectId={projectId}
        competitors={context.competitors}
      />

      <KeyPagesSection projectId={projectId} keyPages={context.keyPages} />

      <CustomSections
        projectId={projectId}
        customSections={context.customSections}
      />

      <ResearchLog projectId={projectId} researchLog={context.researchLog} />
    </div>
  );
}

function ProseSections({
  projectId,
  sections,
  missingSections,
}: {
  projectId: string;
  sections: ProjectContextData["sections"];
  missingSections: ProjectContextData["missingSections"];
}) {
  const update = useContextUpdate(projectId);
  const stored = new Map(sections.map((section) => [section.key, section]));
  // Only the fields the user actually touched are pinned locally; the rest
  // render straight from the query, so a write from SAM shows up on refetch.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const draftOf = (key: ProjectContextSectionKey) =>
    drafts[key] ?? stored.get(key)?.content ?? "";

  // Content is trimmed server-side, so compare trimmed values — otherwise a
  // stray newline leaves the form permanently "unsaved".
  const changed = PROJECT_CONTEXT_SECTION_KEYS.filter(
    (key) => draftOf(key).trim() !== (stored.get(key)?.content ?? ""),
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (update.isPending || changed.length === 0) return;
    update.mutate(
      changed.map((key) => ({ section: key, content: draftOf(key).trim() })),
      // Unpin every draft the save made redundant — one that now matches the
      // server — so those sections render from the query again (a pinned
      // draft would silently overwrite a later agent write on the next
      // save). Anything typed while the request was in flight still differs
      // and stays pinned instead of snapping back.
      {
        onSuccess: (context) => {
          const saved = new Map<string, string>(
            context.sections.map((section) => [section.key, section.content]),
          );
          setDrafts((current) =>
            Object.fromEntries(
              Object.entries(current).filter(
                ([key, value]) => value.trim() !== (saved.get(key) ?? ""),
              ),
            ),
          );
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {missingSections.length === PROJECT_CONTEXT_SECTION_KEYS.length ? (
        <EmptyState>
          Nothing written down yet. Fill in what you can — or ask SAM to draft
          it from your site and confirm what it got right.
        </EmptyState>
      ) : null}

      {PROJECT_CONTEXT_SECTION_KEYS.map((key) => {
        const section = stored.get(key);
        return (
          <Field key={key} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Label htmlFor={`context-${key}`}>
                {PROJECT_CONTEXT_SECTION_LABELS[key]}
              </Label>
              {section ? (
                <Provenance by={section.updatedBy} at={section.updatedAt} />
              ) : (
                <span className="text-xs text-muted-foreground">Empty</span>
              )}
            </div>
            <FieldDescription className="text-xs">
              {SECTION_HINTS[key]}
            </FieldDescription>
            <Textarea
              id={`context-${key}`}
              value={draftOf(key)}
              onChange={(event) => {
                const value = event.target.value;
                setDrafts((current) => {
                  // A draft that matches the store is no draft at all — drop
                  // it so an edit typed and then undone doesn't pin the
                  // section against later agent writes.
                  if (value === (stored.get(key)?.content ?? "")) {
                    const { [key]: _dropped, ...rest } = current;
                    return rest;
                  }
                  return { ...current, [key]: value };
                });
              }}
              rows={4}
              maxLength={PROSE_MAX_CHARS}
              placeholder={SECTION_PLACEHOLDERS[key]}
            />
          </Field>
        );
      })}

      <div className="flex justify-end">
        <Button
          size="sm"
          type="submit"
          disabled={update.isPending || changed.length === 0}
        >
          Save changes
        </Button>
      </div>
    </form>
  );
}

function CustomSections({
  projectId,
  customSections,
}: {
  projectId: string;
  customSections: ProjectContextData["customSections"];
}) {
  const update = useContextUpdate(projectId);
  const [editingSlug, setEditingSlug] = React.useState<string | null>(null);

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Custom sections"
        hint="Anything an agent wrote down that didn't fit the sections above."
      />

      {customSections.length === 0 ? (
        <EmptyState>
          Nothing here yet. Agents add a section when they learn something
          important that has nowhere else to live.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {customSections.map((custom) =>
            editingSlug === custom.slug ? (
              <CustomSectionForm
                key={custom.slug}
                custom={custom}
                pending={update.isPending}
                onCancel={() => setEditingSlug(null)}
                onSave={(title, content) =>
                  update.mutate(
                    [{ customSection: custom.slug, title, content }],
                    { onSuccess: () => setEditingSlug(null) },
                  )
                }
              />
            ) : (
              <Card key={custom.slug} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {custom.title ?? custom.slug}
                    </h3>
                    <Provenance by={custom.updatedBy} at={custom.updatedAt} />
                  </div>
                  <RowActions>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="h-7 px-2.5"
                      aria-label={`Edit ${custom.title ?? custom.slug}`}
                      onClick={() => setEditingSlug(custom.slug)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <ConfirmDeleteButton
                      label={`Delete ${custom.title ?? custom.slug}`}
                      pending={update.isPending}
                      onConfirm={() =>
                        update.mutate([{ deleteCustomSection: custom.slug }])
                      }
                    />
                  </RowActions>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {custom.content}
                </p>
              </Card>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function CustomSectionForm({
  custom,
  pending,
  onCancel,
  onSave,
}: {
  custom: ProjectContextData["customSections"][number];
  pending: boolean;
  onCancel: () => void;
  onSave: (title: string, content: string) => void;
}) {
  const [title, setTitle] = React.useState(custom.title ?? "");
  const [content, setContent] = React.useState(custom.content);

  return (
    <Card>
      <form
        className="space-y-2 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !content.trim()) return;
          onSave(title.trim() || custom.slug, content);
        }}
      >
        <Input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={custom.slug}
          maxLength={120}
          className="h-8"
          aria-label="Section title"
        />
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
          maxLength={PROSE_MAX_CHARS}
          aria-label="Section content"
        />
        <FormActions
          pending={pending}
          disabled={!content.trim()}
          onCancel={onCancel}
        />
      </form>
    </Card>
  );
}

function ResearchLog({
  projectId,
  researchLog,
}: {
  projectId: string;
  researchLog: ProjectContextData["researchLog"];
}) {
  const update = useContextUpdate(projectId);

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Research log"
        hint="What's already been looked up, so nobody buys the same data twice."
      />

      {researchLog.length === 0 ? (
        <EmptyState>
          Nothing logged yet. Agents record paid research here as they run it.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className={listClass}>
            {researchLog.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-foreground">{entry.summary}</p>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span>{entry.entryDate}</span>
                    <Provenance by={entry.createdBy} />
                  </div>
                </div>
                <RowActions>
                  <ConfirmDeleteButton
                    label={`Delete log entry from ${entry.entryDate}`}
                    pending={update.isPending}
                    onConfirm={() =>
                      update.mutate([{ removeResearchLog: [entry.id] }])
                    }
                  />
                </RowActions>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
