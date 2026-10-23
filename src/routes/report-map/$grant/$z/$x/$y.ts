import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GoogleMapsService } from "@/server/features/local-seo/services/GoogleMapsService";
import {
  grantCoversTile,
  verifyReportMapGrant,
} from "@/server/features/reports/reportMapGrant";
import { REPORT_MAP_MAX_ZOOM } from "@/shared/report-map";

// Map tiles for the rank-grid report widget. No session: a shared report's
// reader has none, and the sandboxed frame sends no cookies anyway. The
// signed grant in the path is the authorization, and it only covers the area
// around the report's grid at a few zooms either side of its fitted view (see
// reportMapGrant.ts).
//
// A raw-Response route with no `component`, so it stays out of the client
// bundle; nothing navigates here, the widget's <img> tags do.

const tileSchema = z
  .object({
    z: z.coerce.number().int().min(0).max(REPORT_MAP_MAX_ZOOM),
    x: z.coerce.number().int().min(0),
    y: z.coerce.number().int().min(0),
  })
  .refine(({ z: zoom, x, y }) => x < 2 ** zoom && y < 2 ** zoom);

const refused = () =>
  new Response("No such tile.", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/report-map/$grant/$z/$x/$y")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const tile = tileSchema.safeParse(params);
        if (!tile.success) return refused();
        const scope = await verifyReportMapGrant(params.grant);
        if (!scope || !grantCoversTile(tile.data, scope)) return refused();
        return GoogleMapsService.getTile(tile.data.z, tile.data.x, tile.data.y);
      },
    },
  },
});
