import { runBatch } from "@/db/runBatch";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { resolveContextUpdates } from "@/server/features/project-context/services/contextUpdateOps";
import {
  CUSTOM_SECTION_KEY_PREFIX,
  PROJECT_CONTEXT_SECTION_KEYS,
  PROJECT_CONTEXT_SECTION_LABELS,
  type ContextAuthor,
  type KeyPageRole,
  type ProjectContextSectionKey,
  type ProjectContextUpdate,
} from "@/types/schemas/projectContext";

// Project memory: the qualitative context SAM, MCP clients and the settings UI
// share. Reading, writing and rendering it all go through here; the per-op
// caps and normalization live in contextUpdateOps.
const RESEARCH_LOG_RETENTION_DAYS = 90;
const RESEARCH_LOG_LIMIT = 20;

type ProjectContext = {
  sections: {
    key: ProjectContextSectionKey;
    content: string;
    updatedAt: string;
    updatedBy: ContextAuthor;
  }[];
  /** Typed sections with nothing stored, so agents know what to fill. */
  missingSections: ProjectContextSectionKey[];
  customSections: {
    slug: string;
    title: string | null;
    content: string;
    updatedAt: string;
    updatedBy: ContextAuthor;
  }[];
  competitors: {
    id: string;
    domain: string;
    name: string | null;
    notes: string | null;
    updatedAt: string;
    updatedBy: ContextAuthor;
  }[];
  keyPages: {
    id: string;
    url: string;
    role: KeyPageRole;
    topic: string | null;
    notes: string | null;
    updatedAt: string;
    updatedBy: ContextAuthor;
  }[];
  researchLog: {
    id: string;
    entryDate: string;
    summary: string;
    createdBy: ContextAuthor;
  }[];
};

export async function getProjectContext(
  projectId: string,
): Promise<ProjectContext> {
  const [sectionRows, competitors, keyPages, researchLog] = await Promise.all([
    ProjectContextRepository.listSections(projectId),
    ProjectContextRepository.listCompetitors(projectId),
    ProjectContextRepository.listKeyPages(projectId),
    ProjectContextRepository.listResearchLog(projectId, RESEARCH_LOG_LIMIT),
  ]);

  const stored = new Map(sectionRows.map((row) => [row.key, row]));
  // Typed sections keep their declared order, which is also the order the
  // digest and the settings UI render them in.
  const sections = PROJECT_CONTEXT_SECTION_KEYS.flatMap((key) => {
    const row = stored.get(key);
    return row
      ? [
          {
            key,
            content: row.content,
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy,
          },
        ]
      : [];
  });

  return {
    sections,
    missingSections: PROJECT_CONTEXT_SECTION_KEYS.filter(
      (key) => !stored.has(key),
    ),
    customSections: sectionRows
      .filter((row) => row.key.startsWith(CUSTOM_SECTION_KEY_PREFIX))
      .map((row) => ({
        slug: row.key.slice(CUSTOM_SECTION_KEY_PREFIX.length),
        title: row.title,
        content: row.content,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      })),
    competitors,
    keyPages,
    researchLog: researchLog.map((row) => ({
      id: row.id,
      entryDate: row.entryDate,
      summary: row.summary,
      createdBy: row.createdBy,
    })),
  };
}

function dayStamp(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/**
 * Applies the patch ops in order, then returns the resulting context. The batch
 * is resolved and capped up front, so a call that trips a limit writes nothing
 * at all rather than leaving the project half-updated.
 */
export async function applyContextUpdates(
  projectId: string,
  updates: ProjectContextUpdate[],
  updatedBy: ContextAuthor,
): Promise<ProjectContext> {
  const [sectionRows, competitorRows, keyPageRows] = await Promise.all([
    ProjectContextRepository.listSections(projectId),
    ProjectContextRepository.listCompetitors(projectId),
    ProjectContextRepository.listKeyPages(projectId),
  ]);

  const resolved = resolveContextUpdates(updates, {
    customKeys: new Set(
      sectionRows
        .map((row) => row.key)
        .filter((key) => key.startsWith(CUSTOM_SECTION_KEY_PREFIX)),
    ),
    domains: new Set(competitorRows.map((row) => row.domain)),
    urls: new Set(keyPageRows.map((row) => row.url)),
  });

  // One atomic batch (D1 batch / PG transaction): a mid-batch failure rolls
  // everything back, which is what lets callers retry a whole batch safely.
  await runBatch((tx) =>
    resolved.flatMap((op): Promise<unknown>[] => {
      switch (op.kind) {
        case "upsertSection":
          return [
            ProjectContextRepository.upsertSection(tx, {
              projectId,
              key: op.key,
              title: op.title,
              content: op.content,
              updatedBy,
            }),
          ];
        case "deleteSection":
          return [
            ProjectContextRepository.deleteSection(tx, projectId, op.key),
          ];
        case "upsertCompetitors":
          return ProjectContextRepository.upsertCompetitors(
            tx,
            projectId,
            op.rows,
            updatedBy,
          );
        case "deleteCompetitors":
          return ProjectContextRepository.deleteCompetitors(
            tx,
            projectId,
            op.domains,
          );
        case "upsertKeyPages":
          return ProjectContextRepository.upsertKeyPages(
            tx,
            projectId,
            op.rows,
            updatedBy,
          );
        case "deleteKeyPages":
          return ProjectContextRepository.deleteKeyPages(
            tx,
            projectId,
            op.urls,
          );
        case "deleteResearchLog":
          return ProjectContextRepository.deleteResearchLogEntries(
            tx,
            projectId,
            op.ids,
          );
        case "appendResearchLog":
          return [
            ProjectContextRepository.appendResearchLogEntry(tx, {
              projectId,
              entryDate: dayStamp(),
              summary: op.summary,
              createdBy: updatedBy,
            }),
            // The log only has to answer "was this bought recently?", so it
            // is pruned on write instead of growing forever.
            ProjectContextRepository.pruneResearchLogBefore(
              tx,
              projectId,
              dayStamp(-RESEARCH_LOG_RETENTION_DAYS),
            ),
          ];
      }
    }),
  );

  return getProjectContext(projectId);
}

function pushSection(lines: string[], heading: string, body: string[]) {
  lines.push(
    `## ${heading}`,
    "",
    ...(body.length > 0 ? body : ["_Empty_"]),
    "",
  );
}

/**
 * The one markdown digest of a project's memory, rendered for the MCP tool's
 * `text` payload and for SAM's read-only context block. Typed sections are
 * always listed — an empty one shows up as missing, which is the signal agents
 * use to offer setup.
 */
export function renderProjectContextMarkdown(context: ProjectContext): string {
  const lines = ["# Project context", ""];

  for (const key of PROJECT_CONTEXT_SECTION_KEYS) {
    const section = context.sections.find((entry) => entry.key === key);
    pushSection(
      lines,
      PROJECT_CONTEXT_SECTION_LABELS[key],
      section ? [section.content] : [],
    );
  }

  for (const custom of context.customSections) {
    pushSection(lines, custom.title ?? custom.slug, [custom.content]);
  }

  pushSection(
    lines,
    "Competitors",
    context.competitors.map((competitor) =>
      [
        `- ${competitor.domain}`,
        competitor.name ? ` — ${competitor.name}` : "",
        competitor.notes ? ` (${competitor.notes})` : "",
      ].join(""),
    ),
  );

  pushSection(
    lines,
    "Key pages",
    context.keyPages.map((page) =>
      [
        `- ${page.url} — ${page.role}`,
        page.topic ? ` · ${page.topic}` : "",
        page.notes ? ` (${page.notes})` : "",
      ].join(""),
    ),
  );

  // The log is capped at the newest entries, so the heading counts what is
  // actually here — an agent deciding whether research is stale must not read
  // a truncated list as the whole 90-day window.
  pushSection(
    lines,
    context.researchLog.length === 0
      ? "Research log"
      : `Research log (${context.researchLog.length} ${
          context.researchLog.length === 1 ? "entry" : "entries"
        })`,
    [
      ...context.researchLog.map(
        (entry) => `- ${entry.entryDate}: ${entry.summary}`,
      ),
      ...(context.researchLog.length >= RESEARCH_LOG_LIMIT
        ? [
            "",
            `_Older entries within the ${RESEARCH_LOG_RETENTION_DAYS}-day window are omitted._`,
          ]
        : []),
    ],
  );

  lines.push(
    context.missingSections.length > 0
      ? `Missing sections: ${context.missingSections.join(", ")}`
      : "Missing sections: none",
  );

  return lines.join("\n");
}

export const ProjectContextService = {
  getProjectContext,
  applyContextUpdates,
  renderProjectContextMarkdown,
} as const;
