import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GoogleMapsService } from "@/server/features/local-seo/services/GoogleMapsService";
import { verifyReportMapGrant } from "@/server/features/reports/reportMapGrant";
import { googleMapsViewportSchema } from "@/types/schemas/google-maps";

// Google requires the map's copyright line for what is on screen, so the
// widget asks for it each time the map moves. Same grant as the tiles. The
// report frame has an opaque origin, so the answer is CORS-readable by any
// origin; it is a copyright string, nothing more. On any failure the widget
// shows a generic "Map data ©Google" line.

const viewportQuerySchema = z.object({
  zoom: z.coerce.number(),
  north: z.coerce.number(),
  south: z.coerce.number(),
  east: z.coerce.number(),
  west: z.coerce.number(),
});

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/report-map/$grant/copyright")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        const viewport = viewportQuerySchema
          .pipe(googleMapsViewportSchema)
          .safeParse(query);
        if (!viewport.success || !(await verifyReportMapGrant(params.grant)))
          return Response.json(
            { error: "Not found." },
            { status: 404, headers },
          );
        const copyright = await GoogleMapsService.getCopyright(viewport.data);
        return Response.json({ copyright }, { headers });
      },
    },
  },
});
