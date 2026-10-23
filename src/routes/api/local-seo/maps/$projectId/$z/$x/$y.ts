import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { GoogleMapsService } from "@/server/features/local-seo/services/GoogleMapsService";
import { AppError } from "@/server/lib/errors";
import { responseForAppError } from "@/server/lib/http-errors";

const tileParamsSchema = z
  .object({
    projectId: z.uuid(),
    z: z.coerce.number().int().min(0).max(22),
    x: z.coerce.number().int().min(0),
    y: z.coerce.number().int().min(0),
  })
  .refine(({ z: zoom, x, y }) => x < 2 ** zoom && y < 2 ** zoom);

export const Route = createFileRoute("/api/local-seo/maps/$projectId/$z/$x/$y")(
  {
    server: {
      handlers: {
        GET: async ({ params, request }) => {
          try {
            if (request.headers.get("Sec-Fetch-Site") === "cross-site")
              throw new AppError("FORBIDDEN");
            const parsed = tileParamsSchema.safeParse(params);
            if (!parsed.success)
              throw new AppError("VALIDATION_ERROR", "Invalid map tile.");
            const tile = parsed.data;
            const context = await resolveUserContextFromHeaders(
              request.headers,
            );
            const project = await ProjectRepository.getProjectForOrganization(
              tile.projectId,
              context.organizationId,
            );
            if (!project) throw new AppError("NOT_FOUND");
            return await GoogleMapsService.getTile(tile.z, tile.x, tile.y);
          } catch (error) {
            const response = responseForAppError(
              error,
              "Google Maps unavailable.",
            );
            response.headers.set("Cache-Control", "private, no-store");
            return response;
          }
        },
      },
    },
  },
);
