import { env } from "cloudflare:workers";
import { z } from "zod";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import type { AiExportInput } from "@/types/schemas/ai-visibility";
import { loadAiFullAnswers } from "./aiVisibilityResults";
import { AiVisibilityError } from "./aiVisibilityErrors";

function csvCell(value: string | number | boolean | null | undefined) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** `baseUrl` is the app's public origin; the link must work outside the app. */
export async function exportAiData(input: AiExportInput, baseUrl: string) {
  if (input.includeHistory)
    throw new AiVisibilityError(
      "EXPORT_SCOPE",
      "Choose one run to export. Prompt history can be inspected separately.",
    );
  const { result, answers } = await loadAiFullAnswers(input);
  if (!result.runId)
    throw new AiVisibilityError(
      "NO_RESULTS",
      "There is no baseline or scheduled run to export. Select a manual run explicitly if that is the evidence you want.",
    );
  const body =
    input.format === "json"
      ? JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            projectId: input.projectId,
            run: result.run,
            coverage: result.coverage,
            answers,
          },
          null,
          2,
        )
      : [
          [
            "run_id",
            "observation_id",
            "prompt",
            "engine",
            "status",
            "collected_at",
            "brand_mentions",
            "citation_urls",
            "answer",
          ]
            .map(csvCell)
            .join(","),
          ...answers.map((a) =>
            [
              a.observation.runId,
              a.observation.id,
              a.observation.prompt,
              a.observation.engine,
              a.observation.status,
              a.observation.collectedAt,
              a.observation.brands
                .filter((b) => b.mentioned)
                .map((b) => b.name)
                .join("; "),
              a.sources.map((s) => s.url).join("; "),
              a.answerText,
            ]
              .map(csvCell)
              .join(","),
          ),
        ].join("\r\n");
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  await env.R2.put(`ai-visibility/${input.projectId}/exports/${id}`, body, {
    httpMetadata: {
      contentType: input.format === "json" ? "application/json" : "text/csv",
    },
    customMetadata: { expiresAt, format: input.format },
  });
  const url = new URL("/api/ai-visibility/download", baseUrl);
  url.searchParams.set("projectId", input.projectId);
  url.searchParams.set("exportId", id);
  return {
    url: url.toString(),
    expiresAt,
    format: input.format,
  };
}

export async function handleAiVisibilityDownload(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405 });
  const projectId = z
    .string()
    .uuid()
    .safeParse(url.searchParams.get("projectId"));
  if (!projectId.success) return new Response("Not found", { status: 404 });
  let auth;
  try {
    auth = await resolveUserContextFromHeaders(request.headers);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const project = await ProjectRepository.getProjectForOrganization(
    projectId.data,
    auth.organizationId,
  );
  if (!project) return new Response("Not found", { status: 404 });
  const id = z.string().uuid().safeParse(url.searchParams.get("exportId"));
  if (!id.success) return new Response("Not found", { status: 404 });
  const object = await env.R2.get(
    `ai-visibility/${projectId.data}/exports/${id.data}`,
  );
  if (!object) return new Response("Not found", { status: 404 });
  if (
    !object.customMetadata?.expiresAt ||
    object.customMetadata.expiresAt < new Date().toISOString()
  )
    return new Response("Export expired", { status: 410 });
  const format = object.customMetadata.format === "csv" ? "csv" : "json";
  return new Response(object.body, {
    headers: {
      "Content-Type":
        format === "csv" ? "text/csv; charset=utf-8" : "application/json",
      "Content-Disposition": `attachment; filename="ai-visibility.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
